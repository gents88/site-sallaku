#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  start-local.sh  –  Avvia MongoDB, Backend (NestJS) e Frontend (Angular) in locale
#  Uso: ./start-local.sh
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

# ── Cleanup: termina tutti i processi figli alla chiusura ─────────
BACKEND_PID=""
FRONTEND_PID=""
cleanup() {
  echo ""
  log "Arresto in corso..."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null || true
  # Ferma MongoDB (se avviato da questo script)
  if [[ "$MONGO_STARTED_HERE" == "true" ]]; then
    log "Fermo MongoDB..."
    pkill -x mongod 2>/dev/null || true
  fi
  ok "Tutto fermato. Ciao!"
}
trap cleanup EXIT INT TERM

# ─────────────────────────────────────────────────────────────────
# 1. MongoDB
# ─────────────────────────────────────────────────────────────────
log "Controllo MongoDB..."
MONGO_STARTED_HERE=false

MONGO_LOCAL_DIR="$HOME/.local/mongodb"
MONGO_DATA_DIR="/tmp/mongodb-data"
MONGO_LOG="$MONGO_DATA_DIR/mongod.log"
MONGO_BIN=""

# 1a. Cerca mongod: PATH di sistema, brew, o installazione locale dello script
if   command -v mongod &>/dev/null; then
  MONGO_BIN="mongod"
elif [[ -x "$MONGO_LOCAL_DIR/bin/mongod" ]]; then
  MONGO_BIN="$MONGO_LOCAL_DIR/bin/mongod"
else
  # Installa MongoDB 7.0 come binario ufficiale (nessun brew, nessun sudo)
  warn "mongod non trovato. Scarico MongoDB 7.0 Community (macOS x86_64 ~150 MB)..."
  ARCH="$(uname -m)"
  OS_VER="macos"
  # Sceglie il tarball corretto per arm64 o x86_64
  if [[ "$ARCH" == "arm64" ]]; then
    MONGO_URL="https://fastdl.mongodb.org/osx/mongodb-macos-arm64-7.0.14.tgz"
  else
    MONGO_URL="https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-7.0.14.tgz"
  fi
  MONGO_TGZ="/tmp/mongodb-download.tgz"
  curl -fL --progress-bar "$MONGO_URL" -o "$MONGO_TGZ" \
    || die "Download MongoDB fallito. Controlla la connessione internet."
  mkdir -p "$MONGO_LOCAL_DIR"
  tar -xzf "$MONGO_TGZ" --strip-components=1 -C "$MONGO_LOCAL_DIR" \
    || die "Estrazione MongoDB fallita."
  rm -f "$MONGO_TGZ"
  MONGO_BIN="$MONGO_LOCAL_DIR/bin/mongod"
  ok "MongoDB installato in $MONGO_LOCAL_DIR"
fi

# 1b. Avvia mongod se non è già in esecuzione
if mongosh --quiet --eval "db.adminCommand('ping')" &>/dev/null 2>&1 || \
   "$MONGO_BIN" --version &>/dev/null && pgrep -x mongod &>/dev/null; then
  ok "MongoDB è già in esecuzione."
else
  mkdir -p "$MONGO_DATA_DIR"
  log "Avvio mongod (dbpath: $MONGO_DATA_DIR)..."
  "$MONGO_BIN" --dbpath "$MONGO_DATA_DIR" \
               --logpath "$MONGO_LOG" \
               --port 27017 \
               --fork \
    || die "Impossibile avviare MongoDB. Vedi log: $MONGO_LOG"
  MONGO_STARTED_HERE=true
  sleep 2
  ok "MongoDB avviato (log: $MONGO_LOG)."
fi

# ─────────────────────────────────────────────────────────────────
# 2. Backend .env
# ─────────────────────────────────────────────────────────────────
if [[ ! -f "$BACKEND/.env" ]]; then
  warn "Nessun .env trovato nel backend. Creo da .env.example..."
  if [[ -f "$BACKEND/.env.example" ]]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    # Sovrascrive valori chiave per sviluppo locale
    sed -i '' 's|MONGODB_URI=.*|MONGODB_URI=mongodb://localhost:27017/portfolio|' "$BACKEND/.env"
    sed -i '' 's|NODE_ENV=.*|NODE_ENV=development|'                               "$BACKEND/.env"
    sed -i '' 's|CORS_ORIGIN=.*|CORS_ORIGIN=http://localhost:4200|'               "$BACKEND/.env"
    sed -i '' 's|FRONTEND_URL=.*|FRONTEND_URL=http://localhost:4200|'             "$BACKEND/.env"
    ok ".env creato. Modifica $BACKEND/.env per aggiungere credenziali email, ecc."
  else
    die "Nessun .env.example trovato. Crea manualmente $BACKEND/.env"
  fi
else
  ok ".env backend trovato."
fi

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
# 4. Controlla porte libere
# ─────────────────────────────────────────────────────────────────
if lsof -i :3000 -s TCP:LISTEN &>/dev/null; then
  warn "Porta 3000 già occupata. Forzo chiusura del processo esistente..."
  lsof -ti :3000 -s TCP:LISTEN | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ─────────────────────────────────────────────────────────────────
# 5. Avvia Backend (NestJS – porta 3000)
# ─────────────────────────────────────────────────────────────────
log "Avvio Backend NestJS su http://localhost:3000 ..."
cd "$BACKEND" && npm run start:dev &
BACKEND_PID=$!
cd "$ROOT"
ok "Backend avviato (PID $BACKEND_PID)."

# Breve attesa per lasciar partire NestJS prima di Angular
sleep 3

# ─────────────────────────────────────────────────────────────────
# 6. Avvia Frontend (Angular – porta 4200)
# ─────────────────────────────────────────────────────────────────
log "Avvio Frontend Angular su http://localhost:4200 ..."
cd "$FRONTEND" && npm start &
FRONTEND_PID=$!
cd "$ROOT"
ok "Frontend avviato (PID $FRONTEND_PID)."

# ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Tutto avviato in locale!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Frontend  →  ${CYAN}http://localhost:4200${NC}"
echo -e "  Backend   →  ${CYAN}http://localhost:3000${NC}"
echo -e "  Swagger   →  ${CYAN}http://localhost:3000/api${NC}"
echo -e "  MongoDB   →  ${CYAN}mongodb://localhost:27017/portfolio${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Premi  ${YELLOW}Ctrl+C${NC}  per fermare tutto."
echo ""

# Aspetta i processi figli
wait
