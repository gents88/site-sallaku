#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  start-local.sh  –  Avvia Backend (NestJS) e Frontend (Angular) in locale
#  Il DB è quello remoto Railway (database "portfolio_dev"), condiviso
#  con l'ambiente di sviluppo — non viene avviato nessun MongoDB locale.
#  Uso: ./start-local.sh
#  Ogni avvio termina prima le eventuali istanze precedenti (backend,
#  frontend) e riparte da zero, cosi non si accumulano processi orfani.
# ─────────────────────────────────────────────────────────────────

set -eo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

# ── Colori ────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[start-local]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

kill_port() {
  local port="$1"
  lsof -ti ":$port" -s TCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
}

# ── Cleanup: termina tutti i processi figli alla chiusura ─────────
BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  echo ""
  log "Arresto in corso..."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null || true
  ok "Tutto fermato. Ciao!"
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────
# 1. Backend .env — forza sempre il DB Railway "portfolio_dev"
# ─────────────────────────────────────────────────────────────────
RAILWAY_MONGO_URI="mongodb://mongo:OCLbPjcLuqyKXHNrRHzrSUyentMFuMCz@caboose.proxy.rlwy.net:17308/portfolio_dev?authSource=admin"

if [[ ! -f "$BACKEND/.env" ]]; then
  warn "Nessun .env trovato nel backend. Creo da .env.example..."
  if [[ -f "$BACKEND/.env.example" ]]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    ok ".env creato. Modifica $BACKEND/.env per aggiungere credenziali email, ecc."
  else
    die "Nessun .env.example trovato. Crea manualmente $BACKEND/.env"
  fi
else
  ok ".env backend trovato."
fi

CURRENT_MONGO_URI="$(grep -m1 '^MONGODB_URI=' "$BACKEND/.env" | cut -d= -f2-)"
if [[ "$CURRENT_MONGO_URI" != "$RAILWAY_MONGO_URI" ]]; then
  warn "MONGODB_URI nel .env non corrisponde al DB Railway portfolio_dev. Lo correggo."
  if grep -q '^MONGODB_URI=' "$BACKEND/.env"; then
    sed -i '' "s|^MONGODB_URI=.*|MONGODB_URI=${RAILWAY_MONGO_URI}|" "$BACKEND/.env"
  else
    echo "MONGODB_URI=${RAILWAY_MONGO_URI}" >> "$BACKEND/.env"
  fi
fi
ok "Backend userà il DB Railway: portfolio_dev"

# Porta del backend: quella impostata in .env (default 3000 se assente)
BACKEND_PORT="$(grep -m1 '^PORT=' "$BACKEND/.env" | cut -d= -f2-)"
BACKEND_PORT="${BACKEND_PORT:-3000}"

# ─────────────────────────────────────────────────────────────────
# 2. Termina eventuali istanze precedenti (backend, frontend)
# ─────────────────────────────────────────────────────────────────
log "Termino eventuali istanze precedenti..."
kill_port "$BACKEND_PORT"
kill_port 4200
ok "Istanze precedenti terminate."

# ─────────────────────────────────────────────────────────────────
# 3. Installa dipendenze (se node_modules mancante)
# ─────────────────────────────────────────────────────────────────
if [[ ! -d "$BACKEND/node_modules" ]] || [[ ! -f "$BACKEND/node_modules/.bin/nest" ]]; then
  log "Installo dipendenze backend..."
  (cd "$BACKEND" && npm install)
fi

if [[ ! -d "$FRONTEND/node_modules" ]] || [[ ! -f "$FRONTEND/node_modules/.bin/ng" ]]; then
  log "Installo dipendenze frontend..."
  (cd "$FRONTEND" && npm install)
fi

# ─────────────────────────────────────────────────────────────────
# 4. Avvia Backend e Frontend insieme, in parallelo
# ─────────────────────────────────────────────────────────────────
log "Avvio Backend NestJS su http://localhost:${BACKEND_PORT} ..."
(cd "$BACKEND" && npm run start:dev) &
BACKEND_PID=$!

log "Avvio Frontend Angular su http://localhost:4200 ..."
(cd "$FRONTEND" && npm start) &
FRONTEND_PID=$!

ok "Backend (PID $BACKEND_PID) e Frontend (PID $FRONTEND_PID) avviati in parallelo."

# ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Tutto avviato in locale!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Frontend  →  ${CYAN}http://localhost:4200${NC}"
echo -e "  Backend   →  ${CYAN}http://localhost:${BACKEND_PORT}${NC}"
echo -e "  Swagger   →  ${CYAN}http://localhost:${BACKEND_PORT}/api${NC}"
echo -e "  MongoDB   →  ${CYAN}Railway (portfolio_dev)${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Premi  ${YELLOW}Ctrl+C${NC}  per fermare tutto."
echo ""

# Aspetta i processi figli
wait
