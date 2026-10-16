#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  watchdog.sh — rialza pm2, mongod e backend (cron: @reboot + ogni minuto)
#
#  Senza root non c'è systemd: dopo un riavvio del server il demone pm2 non
#  riparte da solo. Se tutto è già su non fa nulla (e non stampa nulla).
# ─────────────────────────────────────────────────────────────

set -uo pipefail

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"

exec 9>"${APP}/.watchdog.lock"
flock -n 9 || exit 0

# Demone pm2 giù (es. dopo un reboot): ripristina la lista salvata con `pm2 save`
if ! pm2_has mongod; then
  echo "$(date -u +%FT%TZ) pm2 senza mongod → resurrect"
  pm2 resurrect >/dev/null 2>&1 || true
fi

pm2_has mongod || { echo "$(date -u +%FT%TZ) avvio mongod"; pm2 start "$ECOSYSTEM" --only mongod >/dev/null; }

if [[ -e "${APP}/backend/current" ]] && ! pm2_has backend; then
  echo "$(date -u +%FT%TZ) avvio backend"
  pm2 start "$ECOSYSTEM" --only backend >/dev/null
fi
