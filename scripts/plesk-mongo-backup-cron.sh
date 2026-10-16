#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  plesk-mongo-backup-cron.sh — Backup MongoDB locale, da cron su Plesk
#
#  Sostituisce il workflow GitHub Actions .github/workflows/mongo-backup.yml
#  che richiedeva esporre MongoDB a internet per farlo raggiungere dai
#  runner GitHub. Qui il dump gira DENTRO il container mongo (porta mai
#  esposta, nemmeno su localhost) e l'archivio esce via stdout.
#
#  Uso (sul server Plesk, nella cartella del progetto):
#    ./scripts/plesk-mongo-backup-cron.sh
#
#  Installazione in crontab (Plesk → Strumenti e impostazioni →
#  Operazioni pianificate, oppure `crontab -e` come root) — ogni notte alle 03:00:
#    0 3 * * * /opt/site-sallaku/scripts/plesk-mongo-backup-cron.sh >> /var/log/mongo-backup.log 2>&1
#
#  Upload offsite opzionale: se la variabile RCLONE_REMOTE è definita
#  (es. "b2:nome-bucket/mongo-backups") e rclone è installato, ogni
#  archivio viene copiato lì dopo il dump. Senza RCLONE_REMOTE i backup
#  restano solo in locale in ./backups — ricordarsi di configurarlo,
#  altrimenti un guasto disco del server porta via anche i backup.
#
#  Retention: cancella i backup locali più vecchi di RETENTION_DAYS
#  (default 14) per non riempire il disco del server.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${ROOT_DIR}/backups"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ARCHIVE="${BACKUP_DIR}/mongo-backup-$(date +%Y%m%d-%H%M%S).archive.gz"

mkdir -p "$BACKUP_DIR"
cd "$ROOT_DIR"

echo "▶ $(date -u +%Y-%m-%dT%H:%M:%SZ) dump del database portfolio → ${ARCHIVE}"
if ! docker compose -f docker-compose.plesk.yml exec -T mongo \
    mongodump --db portfolio --archive --gzip --quiet > "${ARCHIVE}.part"; then
  rm -f "${ARCHIVE}.part"
  echo "❌ mongodump fallito." >&2
  exit 1
fi
mv "${ARCHIVE}.part" "$ARCHIVE"
echo "  $(du -h "$ARCHIVE" | cut -f1)"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  if command -v rclone &>/dev/null; then
    echo "▶ Upload offsite: ${ARCHIVE} → ${RCLONE_REMOTE}"
    rclone copy "${ARCHIVE}" "${RCLONE_REMOTE}"
  else
    echo "⚠️  RCLONE_REMOTE impostato ma rclone non è installato — backup rimasto solo in locale." >&2
  fi
else
  echo "⚠️  RCLONE_REMOTE non impostato — backup solo in locale su ${BACKUP_DIR}." >&2
fi

echo "▶ Pulizia backup locali più vecchi di ${RETENTION_DAYS} giorni..."
find "${BACKUP_DIR}" -name "mongo-backup-*.archive.gz" -mtime "+${RETENTION_DAYS}" -delete -print

echo "✅ Backup completato."
