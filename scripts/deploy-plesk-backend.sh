#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy-plesk-backend.sh
#  Avvia (o aggiorna) backend + MongoDB + Redis su Plesk via Docker Compose
#
#  USO:
#    chmod +x scripts/deploy-plesk-backend.sh
#    ./scripts/deploy-plesk-backend.sh
#
#  PREREQUISITI SUL SERVER PLESK:
#    - Docker + Docker Compose installati
#    - Il file .env.plesk compilato con valori reali nella root del progetto
#    - Reverse proxy Plesk configurato su porta 3000 (vedi sotto)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.plesk.yml"
ENV_FILE="${ROOT_DIR}/.env.plesk"

# ── Verifica prerequisiti ────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker non trovato. Installalo prima di continuare." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ File .env.plesk non trovato in ${ROOT_DIR}" >&2
  echo "   Crea il file partendo dal template:" >&2
  echo "   cp .env.plesk .env.plesk && nano .env.plesk" >&2
  exit 1
fi

# Verifica che JWT_SECRET non sia il placeholder
JWT_SECRET=$(grep -E '^JWT_SECRET=' "$ENV_FILE" | cut -d'=' -f2-)
if [[ "$JWT_SECRET" == *"SOSTITUISCI"* ]]; then
  echo "❌ Imposta un JWT_SECRET reale in .env.plesk prima di procedere." >&2
  exit 1
fi

echo ""
echo "🚀  Avvio backend stack su Plesk..."
echo "    Compose file: $COMPOSE_FILE"
echo "    Env file:     $ENV_FILE"
echo ""

cd "$ROOT_DIR"

# ── Build + avvio ────────────────────────────────────────────
docker compose -f "$COMPOSE_FILE" pull --quiet mongo redis 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" build backend
docker compose -f "$COMPOSE_FILE" up -d

echo ""
echo "⏳  Attendo che il backend sia healthy..."
RETRIES=20
until docker compose -f "$COMPOSE_FILE" ps backend | grep -q "healthy" || [[ $RETRIES -eq 0 ]]; do
  sleep 5
  RETRIES=$((RETRIES - 1))
  echo "   ... attendo ($RETRIES tentativi rimanenti)"
done

if [[ $RETRIES -eq 0 ]]; then
  echo "⚠️  Il backend impiega più del previsto ad avviarsi."
  echo "   Controlla i log con: docker compose -f docker-compose.plesk.yml logs backend"
else
  echo ""
  echo "✅  Backend in esecuzione su http://127.0.0.1:3000"
  echo ""
  echo "   Health check:"
  curl -sf http://localhost:3000/api/v1/system/health | python3 -m json.tool 2>/dev/null || \
    echo "   (health endpoint non risponde ancora — attendi qualche secondo)"
fi

echo ""
echo "📋  Stato servizi:"
docker compose -f "$COMPOSE_FILE" ps
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  PROSSIMO PASSO: configura il reverse proxy su Plesk"
echo "  Dominio: gentsallaku.it   →   http://localhost:3000"
echo "  (vedi README_DEPLOY_PLESK.md per i dettagli)"
echo "──────────────────────────────────────────────────────────"
