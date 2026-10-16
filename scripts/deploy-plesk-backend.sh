#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy-plesk-backend.sh  —  Build e (ri)avvio backend + MongoDB + Redis
#
#  USO (sul server Plesk, nella cartella del progetto):
#    ./scripts/deploy-plesk-backend.sh
#
#  Di norma non lo lanci a mano: lo esegue scripts/release-backend-plesk.sh
#  dal Mac dopo aver caricato il codice.
#
#  PREREQUISITI:
#    - Docker + docker compose sul server
#    - .env.plesk nella cartella del progetto (creato da server-setup.sh,
#      mai committato: è in .gitignore)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "${ROOT_DIR}/docker-compose.plesk.yml")
ENV_FILE="${ROOT_DIR}/.env.plesk"
HEALTH_URL="http://127.0.0.1:3000/api/v1/system/health"

echo ""
echo "══════════════════════════════════════════════"
echo "  Deploy Backend + MongoDB + Redis su Plesk"
echo "══════════════════════════════════════════════"

# ── Verifica prerequisiti ─────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker non trovato." >&2
  echo "   Installa Docker: https://docs.docker.com/engine/install/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ File .env.plesk non trovato in: ${ROOT_DIR}" >&2
  echo "   Crealo con: ./scripts/server-setup.sh (non è nel repo di proposito)." >&2
  exit 1
fi

cd "$ROOT_DIR"

# ── Pull immagini base e build backend ────────────
echo ""
echo "→ Scarico immagini MongoDB e Redis..."
"${COMPOSE[@]}" pull --quiet mongo redis

echo ""
echo "→ Build immagine backend NestJS..."
"${COMPOSE[@]}" build backend

# ── Avvio ─────────────────────────────────────────
# Servizi elencati esplicitamente: il frontend SSR (profilo "ssr") resta spento.
echo ""
echo "→ Avvio container (mongo + redis + backend)..."
"${COMPOSE[@]}" up -d mongo redis backend

# ── Health check ──────────────────────────────────
echo ""
echo "⏳ Attendo che il backend risponda..."
RETRIES=36   # 36 × 5s = 3 minuti
until curl -sf "$HEALTH_URL" &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -eq 0 ]]; then
    echo ""
    echo "⚠️  Il backend non risponde entro il timeout."
    echo "   Log: docker compose -f docker-compose.plesk.yml logs --tail=50 backend"
    exit 1
  fi
  sleep 5
done

echo ""
echo "✅  Backend attivo su http://127.0.0.1:3000"
curl -s "$HEALTH_URL"
echo ""

# Le immagini vecchie del backend si accumulano a ogni build
docker image prune -f >/dev/null

echo ""
echo "── Stato container ───────────────────────────"
"${COMPOSE[@]}" ps
