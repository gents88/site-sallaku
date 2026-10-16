#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  plesk-mongo-restore.sh — Importa un dump nel MongoDB Docker di Plesk
#
#  Da usare SUL SERVER: il container mongo non espone porte, quindi
#  mongo-restore.sh (che passa da localhost) qui non arriva. L'archivio
#  entra nel container via stdin.
#
#  USO (sul server, nella cartella del progetto):
#    ./scripts/plesk-mongo-restore.sh backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz
#
#  SOURCE_DB = nome del database dentro l'archivio (default portfolio_prod,
#  quello di produzione su Railway). Viene rinominato in "portfolio", il db
#  che il backend usa sul server (MONGODB_URI in docker-compose.plesk.yml).
#  Per un archivio fatto da plesk-mongo-backup-cron.sh: SOURCE_DB=portfolio.
#
#  ATTENZIONE: --drop sostituisce le collezioni esistenti con quelle del dump.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DB="${SOURCE_DB:-portfolio_prod}"
ARCHIVE="${1:-}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "❌ Uso: $0 <file.archive.gz>   (file non trovato: '${ARCHIVE}')" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "▶ Ripristino $(basename "$ARCHIVE"): ${SOURCE_DB}.* → portfolio.*"
read -rp "  Le collezioni esistenti in 'portfolio' verranno sostituite. Continuare? [s/N] " OK
[[ "$OK" == "s" || "$OK" == "S" ]] || { echo "Annullato."; exit 1; }

docker compose -f docker-compose.plesk.yml exec -T mongo \
  mongorestore --archive --gzip --drop \
    --nsInclude="${SOURCE_DB}.*" \
    --nsFrom="${SOURCE_DB}.*" --nsTo="portfolio.*" < "$ARCHIVE"

echo ""
echo "✅ Ripristino completato. Collezioni in 'portfolio':"
docker compose -f docker-compose.plesk.yml exec -T mongo \
  mongosh portfolio --quiet --eval 'db.getCollectionNames().forEach(c => print("  " + c + ": " + db[c].countDocuments()))'
