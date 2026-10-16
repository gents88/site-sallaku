# ─────────────────────────────────────────────────────────────
#  Ambiente comune degli script in ~/app/bin (sourced, non eseguire).
#  Cron parte con un PATH minimo: qui si aggiungono Node di Plesk,
#  pm2/mongosh (~/app/tools) e i binari di MongoDB.
# ─────────────────────────────────────────────────────────────

APP="${HOME}/app"
export PM2_HOME="${APP}/.pm2"
export PATH="/opt/plesk/node/24/bin:${APP}/tools/node_modules/.bin:${APP}/mongodb/bin:${APP}/mongo-tools/bin:${PATH}"
ECOSYSTEM="${APP}/bin/ecosystem.config.js"
HEALTH_URL="http://127.0.0.1:3000/api/v1/system/health"

# Esiste un processo pm2 con questo nome?
pm2_has() {
  pm2 jlist 2>/dev/null | grep -q "\"name\":\"$1\""
}
