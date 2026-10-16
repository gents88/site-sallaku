#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  release-backend-plesk.sh — Rilascia il backend su Plesk dal Mac
#
#  È l'equivalente backend di build-frontend-filezilla.sh: carica il codice
#  del backend sul server via SSH (rsync) e lancia lì deploy-plesk-backend.sh,
#  che ricostruisce il container e aspetta l'health check.
#  Non serve git né credenziali GitHub sul server.
#
#  USO (dalla root del progetto, sul Mac):
#    ./scripts/release-backend-plesk.sh               # carica + build + riavvio
#    ./scripts/release-backend-plesk.sh --upload-only # solo carica (primo setup)
#
#  CONFIGURAZIONE — variabili d'ambiente, oppure un file .env.deploy nella
#  root (in .gitignore) con:
#    PLESK_SSH=root@gentsallaku.it     # utente@host SSH del server
#    PLESK_DIR=/opt/site-sallaku       # cartella del progetto sul server
#                                      # (MAI dentro httpdocs: è pubblica)
#
#  Rilascia solo codice committato: con modifiche locali non committate si
#  ferma, a meno di ALLOW_DIRTY=1.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

UPLOAD_ONLY=false
[[ "${1:-}" == "--upload-only" ]] && UPLOAD_ONLY=true

if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  source .env.deploy
fi

PLESK_SSH="${PLESK_SSH:-}"
PLESK_DIR="${PLESK_DIR:-/opt/site-sallaku}"

if [[ -z "$PLESK_SSH" ]]; then
  echo "❌ PLESK_SSH non impostata (es. root@gentsallaku.it)." >&2
  echo "   Mettila in .env.deploy oppure: PLESK_SSH=utente@host $0" >&2
  exit 1
fi

if [[ "$PLESK_DIR" == *httpdocs* ]]; then
  echo "❌ PLESK_DIR=${PLESK_DIR} è dentro la web root pubblica: .env.plesk sarebbe scaricabile." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain -- backend docker-compose.plesk.yml scripts)" && "${ALLOW_DIRTY:-}" != "1" ]]; then
  echo "❌ Ci sono modifiche non committate in backend/, scripts/ o docker-compose.plesk.yml." >&2
  echo "   Committale, oppure rilancia con ALLOW_DIRTY=1." >&2
  exit 1
fi

COMMIT="$(git rev-parse --short HEAD) (${RELEASE_BRANCH:-$(git branch --show-current)})"

echo ""
echo "══════════════════════════════════════════════"
echo "  Rilascio backend → ${PLESK_SSH}:${PLESK_DIR}"
echo "  Commit: ${COMMIT}"
echo "══════════════════════════════════════════════"

echo ""
echo "→ Carico il codice sul server..."
ssh "$PLESK_SSH" "mkdir -p '${PLESK_DIR}'"

# --delete agisce solo dentro le cartelle caricate (backend/, scripts/): .env.plesk
# e backups/ nella root del server non vengono mai toccati. I file esclusi
# (node_modules, .env* ...) sono protetti anche dalla cancellazione.
rsync -az --delete \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude '.env*' \
  --exclude '*.tsbuildinfo' \
  --relative \
  ./backend ./scripts ./docs/guides/plesk-nginx-directives.conf ./docker-compose.plesk.yml \
  "${PLESK_SSH}:${PLESK_DIR}/"

if $UPLOAD_ONLY; then
  echo ""
  echo "✅ Codice caricato in ${PLESK_SSH}:${PLESK_DIR} (build non eseguito: --upload-only)."
  exit 0
fi

echo ""
echo "→ Build e riavvio sul server..."
ssh "$PLESK_SSH" "cd '${PLESK_DIR}' && echo '${COMMIT} $(date -u +%Y-%m-%dT%H:%M:%SZ)' > .release && ./scripts/deploy-plesk-backend.sh"

echo ""
echo "→ Verifica pubblica..."
# Senza proxy Apache risponde 200 con index.html: serve controllare che sia JSON.
if curl -sf https://gentsallaku.it/api/v1/system/health | grep -q '^{'; then
  echo "✅ https://gentsallaku.it/api/v1/system/health risponde."
else
  echo "⚠️  https://gentsallaku.it/api/v1/system/health non risponde col JSON del backend."
  echo "   Se il proxy nginx non è ancora configurato è normale (vedi docs/guides/deploy-plesk.md, passo 4)."
fi
