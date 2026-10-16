#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  activate-release.sh — Attiva un bundle del backend già compilato
#
#  USO (sul server, lo lancia release-backend-plesk.sh):
#    ~/app/bin/activate-release.sh ~/app/incoming/backend-<sha>.tgz <etichetta>
#
#  Estrae in ~/app/backend/releases/<id>, collega .env condiviso, sposta il
#  symlink current, riavvia il backend e aspetta l'health check. Se il nuovo
#  backend non risponde torna alla release precedente.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BUNDLE="$1"
LABEL="${2:-manual}"

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"

ENV_FILE="${APP}/shared/backend.env"
[[ -f "$ENV_FILE" ]] || { echo "❌ Manca ${ENV_FILE}" >&2; exit 1; }

ID="$(date +%Y%m%d-%H%M%S)-${LABEL}"
DIR="${APP}/backend/releases/${ID}"
CURRENT="${APP}/backend/current"

echo "→ Estraggo la release ${ID}..."
mkdir -p "$DIR"
tar xzf "$BUNDLE" -C "$DIR"
ln -sfn "$ENV_FILE" "$DIR/.env"
# Cache dei modelli OCR di tesseract: condivisa, non riscaricata a ogni release
ln -sfn "${APP}/shared/tessdata" "$DIR/.tessdata"

PREV="$(readlink "$CURRENT" 2>/dev/null || true)"

switch_to() {
  ln -sfn "$1" "${CURRENT}.new"
  mv -T "${CURRENT}.new" "$CURRENT"
  # delete + start invece di restart: così anche le modifiche a
  # ecosystem.config.js (limiti di memoria, node_args) entrano in vigore
  pm2_has backend && pm2 delete backend >/dev/null
  pm2 start "$ECOSYSTEM" --only backend >/dev/null
}

wait_healthy() {
  for _ in $(seq 1 36); do   # 3 minuti
    curl -sf "$HEALTH_URL" >/dev/null && return 0
    sleep 5
  done
  return 1
}

echo "→ Riavvio il backend..."
switch_to "$DIR"

if ! wait_healthy; then
  echo "❌ Il nuovo backend non risponde. Ultimi log:" >&2
  pm2 logs backend --lines 40 --nostream >&2 || true
  if [[ -n "$PREV" && -d "$PREV" ]]; then
    echo "↩️  Torno alla release precedente: $(basename "$PREV")" >&2
    switch_to "$PREV"
    wait_healthy && echo "   release precedente di nuovo attiva." >&2
  fi
  rm -rf "$DIR"
  exit 1
fi

pm2 save --force >/dev/null
rm -f "$BUNDLE"

# Tiene le ultime 5 release per un rollback rapido
ls -1dt "${APP}"/backend/releases/*/ | tail -n +6 | xargs -r rm -rf

echo "✅ Release ${ID} attiva."
curl -s "$HEALTH_URL"
echo ""
