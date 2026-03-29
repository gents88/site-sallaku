#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  mongo-dump.sh — Esporta il database MongoDB remoto
#
#  Uso:
#    chmod +x scripts/mongo-dump.sh
#    ./scripts/mongo-dump.sh
#
#  Oppure con URI diretto (Railway / Plesk):
#    MONGO_URI="mongodb://user:pass@host:27017/dbname" ./scripts/mongo-dump.sh
#
#  Output: ./backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz
#
#  Requisiti: Docker installato (usa mongo:7 per eseguire mongodump)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
ARCHIVE_NAME="mongo-backup-${TIMESTAMP}.archive.gz"

mkdir -p "$BACKUP_DIR"

# ── Legge MONGO_URI da ambiente o chiede interattivamente ──
if [[ -z "${MONGO_URI:-}" ]]; then
  # Prova a leggerlo dal file .env del backend
  ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/portfolio-backend/.env"
  if [[ -f "$ENV_FILE" ]]; then
    MONGO_URI=$(grep -E '^MONGODB_URI=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi
fi

if [[ -z "${MONGO_URI:-}" ]]; then
  echo ""
  echo "  Inserisci la MongoDB URI del server remoto (Railway / Plesk)."
  echo "  Formato: mongodb://user:pass@host:port/dbname"
  echo "           mongodb+srv://user:pass@cluster.mongodb.net/dbname"
  echo ""
  read -r -p "  MONGO_URI: " MONGO_URI
fi

if [[ -z "${MONGO_URI:-}" ]]; then
  echo "❌ MONGO_URI non fornita. Interruzione." >&2
  exit 1
fi

echo ""
echo "▶ Avvio dump MongoDB → ${BACKUP_DIR}/${ARCHIVE_NAME}"
echo "  (usa container Docker mongo:7 — nessuna installazione locale necessaria)"
echo ""

docker run --rm \
  -v "${BACKUP_DIR}:/backup" \
  mongo:7 \
  mongodump \
    --uri="${MONGO_URI}" \
    --archive="/backup/${ARCHIVE_NAME}" \
    --gzip \
    --quiet

echo ""
echo "✅ Dump completato: backups/${ARCHIVE_NAME}"
echo ""
echo "  Per importarlo localmente esegui:"
echo "    ./scripts/mongo-restore.sh backups/${ARCHIVE_NAME}"
echo ""
