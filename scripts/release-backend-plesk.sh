#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  release-backend-plesk.sh — Rilascia il backend su Plesk
#
#  Lo usa la CI a ogni push su develop (job deploy-backend) e si può lanciare
#  a mano dal Mac. Compila il backend in un bundle Linux, lo carica via SSH
#  in ~/app sul server (utente di dominio, niente root) e lo attiva con
#  ~/app/bin/activate-release.sh: restart con pm2, health check, rollback
#  automatico se il nuovo backend non risponde.
#
#  USO (dalla root del progetto):
#    ./scripts/release-backend-plesk.sh           # build + rilascio
#    ./scripts/release-backend-plesk.sh --setup   # prima installazione (MongoDB, pm2, cron)
#
#  CONFIGURAZIONE — variabili d'ambiente oppure .env.deploy (in .gitignore):
#    PLESK_SSH=plesk-gentsallaku      # utente@host SSH (o alias di ~/.ssh/config)
#  Opzionale: BUNDLE=/percorso.tgz per usare un bundle già compilato (CI).
#
#  Rilascia solo codice committato: con modifiche locali non committate si
#  ferma, a meno di ALLOW_DIRTY=1.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  source .env.deploy
fi

PLESK_SSH="${PLESK_SSH:?PLESK_SSH non impostata (in .env.deploy o come variabile)}"
SHA="$(git rev-parse --short HEAD)"
BRANCH="${RELEASE_BRANCH:-$(git branch --show-current)}"

# Script e config lato server: aggiornati a ogni rilascio
echo "→ Aggiorno gli script in ~/app/bin..."
ssh "$PLESK_SSH" 'mkdir -p ~/app/bin && chmod 700 ~/app'
rsync -az --delete --chmod=Du=rwx,Dgo=,Fu=rwx,Fgo= scripts/plesk/ "${PLESK_SSH}:app/bin/"

if [[ "${1:-}" == "--setup" ]]; then
  ssh "$PLESK_SSH" '~/app/bin/setup-server.sh'
  exit 0
fi

if [[ -n "$(git status --porcelain -- backend scripts)" && "${ALLOW_DIRTY:-}" != "1" ]]; then
  echo "❌ Modifiche non committate in backend/ o scripts/: committale o usa ALLOW_DIRTY=1." >&2
  exit 1
fi

echo ""
echo "══════════════════════════════════════════════"
echo "  Rilascio backend ${SHA} (${BRANCH}) → ${PLESK_SSH}"
echo "══════════════════════════════════════════════"

if [[ -z "${BUNDLE:-}" ]]; then
  mkdir -p .bundle-build
  BUNDLE="${ROOT_DIR}/.bundle-build/backend-${SHA}.tgz"
  ./scripts/build-backend-bundle.sh "$BUNDLE"
fi

echo "→ Carico il bundle..."
REMOTE_BUNDLE="app/incoming/backend-${SHA}.tgz"
ssh "$PLESK_SSH" 'mkdir -p ~/app/incoming'
scp -q "$BUNDLE" "${PLESK_SSH}:${REMOTE_BUNDLE}"

echo "→ Attivo la release..."
ssh "$PLESK_SSH" "~/app/bin/activate-release.sh ~/${REMOTE_BUNDLE} ${SHA}"

echo ""
# Senza le regole proxy in .htaccess Apache risponde 200 con index.html: serve JSON
if curl -sf https://gentsallaku.it/api/v1/system/health | grep -q '^{'; then
  echo "✅ https://gentsallaku.it/api/v1/system/health risponde."
else
  echo "⚠️  https://gentsallaku.it/api/v1/... non arriva al backend (regole proxy in .htaccess assenti?)."
fi
