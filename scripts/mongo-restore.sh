#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  mongo-restore.sh — Importa un backup MongoDB in locale
#
#  Uso:
#    chmod +x scripts/mongo-restore.sh
#    ./scripts/mongo-restore.sh backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz
#
#  Oppure specificando un URI di destinazione:
#    TARGET_URI="mongodb://localhost:27017" ./scripts/mongo-restore.sh backups/backup.archive.gz
#
#  Prerequisiti:
#    - Docker installato
#    - MongoDB locale avviata (es: docker compose -f docker-compose.local.yml up -d mongo)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_URI="${TARGET_URI:-mongodb://host.docker.internal:27017}"

# ── Argomento: file di backup ──────────────────────────────
ARCHIVE="${1:-}"
if [[ -z "$ARCHIVE" ]]; then
  # Cerca l'ultimo backup nella cartella backups/
  ARCHIVE=$(ls -t "${ROOT_DIR}/backups/"*.archive.gz 2>/dev/null | head -1 || true)
  if [[ -z "$ARCHIVE" ]]; then
    echo "❌ Nessun file di backup trovato." >&2
    echo "   Uso: $0 backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz" >&2
    exit 1
  fi
  echo "ℹ️  Nessun file specificato — uso l'ultimo backup: $(basename "$ARCHIVE")"
fi

# Percorso assoluto
if [[ "$ARCHIVE" != /* ]]; then
  ARCHIVE="${ROOT_DIR}/${ARCHIVE}"
fi

if [[ ! -f "$ARCHIVE" ]]; then
  echo "❌ File non trovato: $ARCHIVE" >&2
  exit 1
fi

ARCHIVE_DIR="$(dirname "$ARCHIVE")"
ARCHIVE_FILE="$(basename "$ARCHIVE")"

echo ""
echo "▶ Ripristino backup: ${ARCHIVE_FILE}"
echo "  → destinazione: ${TARGET_URI}"
echo "  (usa container Docker mongo:7 — nessuna installazione locale necessaria)"
echo ""

# host.docker.internal funziona su macOS/Windows;
# su Linux aggiunto automaticamente con --add-host
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "${ARCHIVE_DIR}:/backup" \
  mongo:7 \
  mongorestore \
    --uri="${TARGET_URI}" \
    --archive="/backup/${ARCHIVE_FILE}" \
    --gzip \
    --drop \
    --nsFrom="test.*" \
    --nsTo="portfolio.*" \
    --quiet

echo ""
echo "✅ Ripristino completato."
echo ""
echo "  Verifica il database su mongo-express:"
echo "    http://localhost:8081"
echo ""
echo "  Oppure via mongosh:"
echo "    docker exec -it \$(docker ps -qf name=mongo) mongosh"
echo ""
