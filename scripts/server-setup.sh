#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  server-setup.sh — Setup completo backend su Plesk
#
#  Esegui questo script sul SERVER via Plesk Web SSH:
#    Plesk → Domini → gentsallaku.it → Web SSH (o Terminale)
#    bash <(curl -fsSL https://raw.githubusercontent.com/...) 
#    OPPURE copia/incolla il contenuto direttamente nel terminale.
#
#  Cosa fa questo script:
#    1. Individua la directory del progetto
#    2. Verifica che Docker sia disponibile
#    3. Scrive il file .env.plesk con i valori reali
#    4. Avvia MongoDB + Redis + Backend con docker compose
#    5. Verifica che il backend risponda
#    6. Stampa le istruzioni per il reverse proxy nginx in Plesk
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colori output ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
err()  { echo -e "${RED}❌  $*${NC}"; exit 1; }
info() { echo -e "${BLUE}ℹ️   $*${NC}"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Plesk Backend Setup — gentsallaku.it         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Trova la directory del progetto ───────────────────────────────────────
# Cerca la directory che contiene docker-compose.plesk.yml
PROJECT_DIR=""
for candidate in \
  /opt/site-sallaku \
  /var/www/vhosts/gentsallaku.it/site-sallaku \
  /home/gentsallaku.it_wdv9je9vcto/site-sallaku \
  /home/gentsallaku/site-sallaku \
  "$HOME/site-sallaku"; do
  if [[ -f "${candidate}/docker-compose.plesk.yml" ]]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [[ -z "$PROJECT_DIR" ]]; then
  # Ricerca più ampia
  PROJECT_DIR=$(find /opt /var/www /home "$HOME" -maxdepth 5 -name "docker-compose.plesk.yml" 2>/dev/null | head -1 | xargs dirname || true)
fi

if [[ -z "$PROJECT_DIR" ]]; then
  err "Impossibile trovare la directory del progetto.\n   Assicurati che il repo sia clonato sul server.\n   Poi esegui: cd /percorso/progetto && bash scripts/server-setup.sh"
fi

ok "Progetto trovato: $PROJECT_DIR"
cd "$PROJECT_DIR"

# ── 2. Verifica Docker ────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  err "Docker non è installato su questo server.\n   Installalo via Plesk Extensions → Docker oppure chiedi al supporto hosting."
fi

DOCKER_COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  err "docker compose non trovato. Aggiorna Docker a versione >= 20 oppure installa docker-compose."
fi

ok "Docker disponibile — compose: $DOCKER_COMPOSE_CMD"

# ── 3. Scrivi .env.plesk ──────────────────────────────────────────────────────
if [[ -f .env.plesk ]]; then
  ok ".env.plesk già presente — non lo sovrascrivo (evita di perdere segreti già ruotati)."
else
  info "Nessun .env.plesk trovato: lo creo chiedendo i valori richiesti."
  warn "Le credenziali NON vengono mai scritte in questo script: le inserisci ora a runtime."

  read -rp "SMTP_USER (email Gmail mittente): " SMTP_USER_INPUT
  read -rsp "SMTP_PASS (Gmail App Password, non la password normale): " SMTP_PASS_INPUT; echo ""
  read -rp "ADMIN_EMAIL [admin@gentsallaku.it]: " ADMIN_EMAIL_INPUT
  ADMIN_EMAIL_INPUT="${ADMIN_EMAIL_INPUT:-admin@gentsallaku.it}"
  read -rsp "ADMIN_PASSWORD (lascia vuoto per generarne una casuale): " ADMIN_PASSWORD_INPUT; echo ""
  if [[ -z "$ADMIN_PASSWORD_INPUT" ]]; then
    ADMIN_PASSWORD_INPUT="$(openssl rand -base64 18)"
    info "ADMIN_PASSWORD generata: ${ADMIN_PASSWORD_INPUT}  (salvala ora, non verrà ristampata)"
  fi

  JWT_SECRET_GENERATED="$(openssl rand -base64 48)"

  cat > .env.plesk << ENVEOF
# Generato da server-setup.sh il $(date -u +%Y-%m-%dT%H:%M:%SZ) — NON committare su git
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://mongo:27017/portfolio
REDIS_URL=redis://redis:6379
JWT_SECRET=${JWT_SECRET_GENERATED}
JWT_EXPIRES_IN=30m
ADMIN_NAME=Admin
ADMIN_EMAIL=${ADMIN_EMAIL_INPUT}
ADMIN_PASSWORD=${ADMIN_PASSWORD_INPUT}
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=${SMTP_USER_INPUT}
SMTP_PASS=${SMTP_PASS_INPUT}
EMAIL_FROM="Portfolio Contact <${SMTP_USER_INPUT}>"
EMAIL_TO=${ADMIN_EMAIL_INPUT}
FRONTEND_URL=https://gentsallaku.it
CORS_ORIGIN=https://gentsallaku.it,https://www.gentsallaku.it
GSC_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GSC_SITE_URL=https://gentsallaku.it
ENVEOF

  chmod 600 .env.plesk
  ok ".env.plesk scritto (permessi 600)"
fi

# ── 4. Pull immagini base ─────────────────────────────────────────────────────
info "Download immagini Docker (mongo, redis)..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml pull mongo redis --quiet 2>/dev/null || true

# ── 5. Build backend ──────────────────────────────────────────────────────────
info "Build immagine backend NestJS..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml build backend

# ── 6. Avvio stack ────────────────────────────────────────────────────────────
info "Avvio stack Docker (mongo + redis + backend)..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml up -d mongo redis backend

# ── 7. Attesa health check ────────────────────────────────────────────────────
info "Attesa backend healthy (max 90 secondi)..."
RETRIES=18
HEALTHY=false
while [[ $RETRIES -gt 0 ]]; do
  STATUS=$($DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml ps backend --format json 2>/dev/null | \
    python3 -c "import sys,json; d=sys.stdin.read().strip(); rows=json.loads(d) if d.startswith('[') else [json.loads(d)]; print(rows[0].get('Health','') if rows else '')" 2>/dev/null || echo "")
  if [[ "$STATUS" == "healthy" ]]; then
    HEALTHY=true
    break
  fi
  RETRIES=$((RETRIES - 1))
  echo -n "."
  sleep 5
done
echo ""

if [[ "$HEALTHY" == "true" ]]; then
  ok "Backend in esecuzione e healthy!"
else
  warn "Il backend sta impiegando più tempo del solito. Controlla i log:"
  echo "  $DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml logs --tail=40 backend"
fi

# ── 8. Test health endpoint ───────────────────────────────────────────────────
if curl -sf http://localhost:3000/api/v1/system/health > /tmp/health_out.json 2>/dev/null; then
  ok "Health endpoint risponde:"
  cat /tmp/health_out.json | python3 -m json.tool 2>/dev/null || cat /tmp/health_out.json
else
  warn "Health endpoint non risponde ancora su localhost:3000"
fi

# ── 9. Stato finale ───────────────────────────────────────────────────────────
echo ""
info "Stato servizi Docker:"
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml ps

# ── 10. Istruzioni nginx ──────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  PASSO FINALE: configura il reverse proxy in Plesk GUI     ${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  1. Apri Plesk → Domini → gentsallaku.it → Apache & nginx Settings"
echo "  2. Scorri a 'Additional nginx directives' e incolla:"
echo ""
cat "${PROJECT_DIR}/docs/guides/plesk-nginx-directives.conf"
echo ""
echo "  3. Clicca OK / Salva"
echo ""
echo -e "${GREEN}Fatto! Verifica finale dopo aver salvato nginx:${NC}"
echo "  curl https://gentsallaku.it/api/v1/system/health"
echo ""
