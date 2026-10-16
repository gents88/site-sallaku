#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  mongo-restore.sh — Importa un dump nel database "portfolio" del server
#
#  USO (sul server):
#    ~/app/bin/mongo-restore.sh <file.archive.gz> [db-di-origine]
#
#  db-di-origine = nome del database dentro l'archivio, rinominato in
#  "portfolio". Default portfolio_prod (dump da Railway); per un backup fatto
#  da mongo-backup.sh passa "portfolio".
#
#  ATTENZIONE: --drop sostituisce le collezioni esistenti con quelle del dump.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ARCHIVE="$1"
SOURCE_DB="${2:-portfolio_prod}"

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
# shellcheck disable=SC1091
source "${APP}/shared/mongo.env"

ROOT_URI="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASS}@127.0.0.1:27017/?authSource=admin"

echo "▶ Ripristino $(basename "$ARCHIVE"): ${SOURCE_DB}.* → portfolio.*"
mongorestore --quiet --uri="$ROOT_URI" --archive="$ARCHIVE" --gzip --drop \
  --nsInclude="${SOURCE_DB}.*" --nsFrom="${SOURCE_DB}.*" --nsTo="portfolio.*"

echo "✅ Documenti per collezione in 'portfolio':"
mongosh --quiet --norc "mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASS}@127.0.0.1:27017/portfolio?authSource=admin" --eval '
  db.getCollectionNames().sort().forEach(c => print("  " + c + ": " + db[c].countDocuments()))'
