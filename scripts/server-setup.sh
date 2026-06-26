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
  /var/www/vhosts/gentsallaku.it/site-sallaku \
  /var/www/vhosts/gentsallaku.it/httpdocs \
  /home/gentsallaku.it_wdv9je9vcto/site-sallaku \
  /home/gentsallaku/site-sallaku \
  "$HOME/site-sallaku" \
  "$HOME/httpdocs/site-sallaku"; do
  if [[ -f "${candidate}/docker-compose.plesk.yml" ]]; then
    PROJECT_DIR="$candidate"
    break
  fi
done

if [[ -z "$PROJECT_DIR" ]]; then
  # Ricerca più ampia
  PROJECT_DIR=$(find /var/www /home "$HOME" -maxdepth 5 -name "docker-compose.plesk.yml" 2>/dev/null | head -1 | xargs dirname || true)
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
info "Scrittura .env.plesk con valori di produzione..."

cat > .env.plesk << 'ENVEOF'
# Generato automaticamente da server-setup.sh — NON committare su git
PORT=3000
NODE_ENV=production
MONGODB_URI=mongodb://mongo:27017/portfolio
REDIS_URL=redis://redis:6379
JWT_SECRET=bnR/NTyWdndH58LrYMSwvF8VkHlaRfnobVPZwEebW0QXIRECrLPaexivtrEa27Ft
JWT_EXPIRES_IN=7d
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@gentsallaku.it
ADMIN_PASSWORD=sPLBAZ9ZLXhjqv6v
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=gentsallaku@gmail.com
SMTP_PASS=xp1I6p73&
EMAIL_FROM="Portfolio Contact <gentsallaku@gmail.com>"
EMAIL_TO=admin@gentsallaku.it
FRONTEND_URL=https://gentsallaku.it
CORS_ORIGIN=https://gentsallaku.it,https://www.gentsallaku.it
GSC_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GSC_SITE_URL=https://gentsallaku.it
ENVEOF

ok ".env.plesk scritto"

# ── 4. Pull immagini base ─────────────────────────────────────────────────────
info "Download immagini Docker (mongo, redis)..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml pull mongo redis --quiet 2>/dev/null || true

# ── 5. Build backend ──────────────────────────────────────────────────────────
info "Build immagine backend NestJS..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml build backend

# ── 6. Avvio stack ────────────────────────────────────────────────────────────
info "Avvio stack Docker (mongo + redis + backend)..."
$DOCKER_COMPOSE_CMD -f docker-compose.plesk.yml up -d

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
cat << 'NGINXEOF'
location /api/ {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
}
NGINXEOF
echo ""
echo "  3. Clicca OK / Salva"
echo ""
echo -e "${GREEN}Fatto! Verifica finale dopo aver salvato nginx:${NC}"
echo "  curl https://gentsallaku.it/api/v1/system/health"
echo ""
