#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  mongo-backup.sh — Dump notturno del database (cron alle 03:30)
#
#  Archivi in ~/app/backups, tenuti RETENTION_DAYS giorni (default 14).
#  Sono sullo stesso disco del database: per una copia esterna scaricali
#  ogni tanto (FileZilla/scp) o aggiungi un upload qui.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
# shellcheck disable=SC1091
source "${APP}/shared/mongo.env"

RETENTION_DAYS="${RETENTION_DAYS:-14}"
ARCHIVE="${APP}/backups/mongo-backup-$(date +%Y%m%d-%H%M%S).archive.gz"

echo "▶ $(date -u +%FT%TZ) dump → ${ARCHIVE}"
mongodump --quiet \
  --uri="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASS}@127.0.0.1:27017/?authSource=admin" \
  --db=portfolio --archive="${ARCHIVE}.part" --gzip
mv "${ARCHIVE}.part" "$ARCHIVE"
chmod 600 "$ARCHIVE"
echo "  $(du -h "$ARCHIVE" | cut -f1)"

find "${APP}/backups" -name "mongo-backup-*.archive.gz" -mtime "+${RETENTION_DAYS}" -delete -print

# Rotazione dei log pm2 (stdout di mongod e backend) oltre i 20 MB: copia in
# .1 e svuota sul posto, perché pm2 tiene il file aperto in append.
for f in "${PM2_HOME}"/logs/*.log; do
  [[ -f "$f" && $(stat -c %s "$f") -gt 20971520 ]] || continue
  cp "$f" "${f}.1" && : > "$f"
  echo "  log ruotato: $(basename "$f")"
done
