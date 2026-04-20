#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  deploy-plesk-backend.sh  —  Deploy backend + MongoDB su Plesk
#
#  USO (sul server Plesk, nella root del progetto):
#    chmod +x scripts/deploy-plesk-backend.sh
#    ./scripts/deploy-plesk-backend.sh
#
#  PREREQUISITI:
#    - Docker installato sul server
#    - File .env.plesk presente nella root del progetto
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.plesk.yml"
ENV_FILE="${ROOT_DIR}/.env.plesk"

echo ""
echo "══════════════════════════════════════════════"
echo "  Deploy Backend + MongoDB su Plesk"
echo "══════════════════════════════════════════════"

# ── Verifica prerequisiti ─────────────────────────
if ! command -v docker &>/dev/null; then
  echo "❌ Docker non trovato." >&2
  echo "   Installa Docker: https://docs.docker.com/engine/install/" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ File .env.plesk non trovato in: ${ROOT_DIR}" >&2
  echo "   Deve essere già presente nel repo. Controlla git pull." >&2
  exit 1
fi

cd "$ROOT_DIR"

# ── Pull immagine MongoDB e build backend ─────────
echo ""
echo "→ Scarico immagine MongoDB..."
docker compose -f "$COMPOSE_FILE" pull mongo

echo ""
echo "→ Build immagine backend NestJS..."
docker compose -f "$COMPOSE_FILE" build backend

# ── Avvio ─────────────────────────────────────────
echo ""
echo "→ Avvio container (backend + mongo)..."
docker compose -f "$COMPOSE_FILE" up -d

# ── Health check ──────────────────────────────────
echo ""
echo "⏳ Attendo che MongoDB sia pronto..."
RETRIES=24   # 24 × 5s = 2 minuti
until docker compose -f "$COMPOSE_FILE" ps mongo | grep -q "(healthy)" || [[ $RETRIES -eq 0 ]]; do
  sleep 5
  RETRIES=$((RETRIES - 1))
  echo "   ... ($RETRIES tentativi rimanenti)"
done

echo ""
echo "⏳ Attendo che il backend risponda..."
RETRIES=24
until curl -sf http://127.0.0.1:3000/api/v1/system/health &>/dev/null || [[ $RETRIES -eq 0 ]]; do
  sleep 5
  RETRIES=$((RETRIES - 1))
  echo "   ... ($RETRIES tentativi rimanenti)"
done

if [[ $RETRIES -eq 0 ]]; then
  echo ""
  echo "⚠️  Il backend non risponde entro il timeout."
  echo "   Controlla i log: docker compose -f docker-compose.plesk.yml logs --tail=50 backend"
  exit 1
fi

echo ""
echo "✅  Backend attivo su http://127.0.0.1:3000"
echo ""
echo "── Health check ──────────────────────────────"
curl -s http://127.0.0.1:3000/api/v1/system/health | python3 -m json.tool 2>/dev/null \
  || curl -s http://127.0.0.1:3000/api/v1/system/health

echo ""
echo "── Stato container ───────────────────────────"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "══════════════════════════════════════════════"
echo "  FATTO! Prossimo passo:"
echo "  Nel pannello Plesk → Apache & nginx Settings"
echo "  aggiungi questa direttiva nginx:"
echo ""
echo '  location /api/ {'
echo '    proxy_pass         http://127.0.0.1:3000;'
echo '    proxy_http_version 1.1;'
echo '    proxy_set_header   Host $host;'
echo '    proxy_set_header   X-Real-IP $remote_addr;'
echo '  }'
echo "══════════════════════════════════════════════"
