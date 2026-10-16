#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  build-frontend-filezilla.sh
#  Compila il frontend Angular e crea un archivio ZIP pronto per
#  essere caricato su Plesk via FileZilla.
#
#  Uso:
#    ./scripts/build-frontend-filezilla.sh
#
#  Output:
#    frontend-deploy.zip  (nella root del progetto)
#
#  Su Plesk carica il CONTENUTO della cartella nell'archivio
#  (non la cartella stessa) dentro la web root del dominio,
#  tipicamente:  /var/www/vhosts/gentsallaku.it/httpdocs/
# ─────────────────────────────────────────────────────────────────

set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND="$ROOT/frontend"
DIST="$FRONTEND/dist/portfolio-frontend/browser"
OUTPUT="$ROOT/frontend-deploy.zip"

# ── Colori ────────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[build-filezilla]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
die()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 1. Controlla dipendenze ───────────────────────────────────────
command -v node >/dev/null 2>&1 || die "node non trovato. Installa Node.js."
command -v npm  >/dev/null 2>&1 || die "npm non trovato."
command -v zip  >/dev/null 2>&1 || die "zip non trovato. Installa con: brew install zip"

# ── 2. Installa dipendenze npm se mancanti ────────────────────────
if [[ ! -d "$FRONTEND/node_modules" ]]; then
  log "Installazione dipendenze npm..."
  cd "$FRONTEND" && npm install
fi

# ── 3. Build di produzione ────────────────────────────────────────
log "Build Angular production..."
cd "$FRONTEND"
npm run build:prod

# ── 4. Verifica output ────────────────────────────────────────────
[[ -d "$DIST" ]] || die "Cartella dist non trovata: $DIST"

# Con SSR abilitato, l'application builder genera "index.csr.html"
# (il fallback per hosting statico) invece di "index.html" nella
# cartella browser. Servono ENTRAMBI: "index.html" per il deploy statico
# e "index.csr.html" perché è il fallback SPA del .htaccess (rotte non
# prerenderizzate, es. /admin/login). Con un semplice rename il server
# teneva un index.csr.html vecchio che caricava una build precedente.
if [[ ! -f "$DIST/index.html" && -f "$DIST/index.csr.html" ]]; then
  log "Copio index.csr.html in index.html (deploy statico, SSR non usato)..."
  cp "$DIST/index.csr.html" "$DIST/index.html"
fi
if [[ ! -f "$DIST/index.csr.html" && -f "$DIST/index.html" ]]; then
  cp "$DIST/index.html" "$DIST/index.csr.html"
fi

[[ -f "$DIST/index.html" ]] || die "index.html non trovato nel dist."

# ── 5. Crea archivio ZIP ──────────────────────────────────────────
log "Creazione archivio ZIP..."
rm -f "$OUTPUT"
cd "$DIST"
zip -r "$OUTPUT" . -x "*.DS_Store" -x "__MACOSX/*"

ok "Archivio creato: $OUTPUT"
echo ""
echo "  Dimensione: $(du -sh "$OUTPUT" | cut -f1)"
echo ""
echo "  ┌─ Prossimi passi ─────────────────────────────────────────────────────┐"
echo "  │ 1. Apri FileZilla e connettiti al server Plesk via SFTP/FTP           │"
echo "  │ 2. Naviga in: /var/www/vhosts/gentsallaku.it/httpdocs/                │"
echo "  │ 3. Carica il CONTENUTO di frontend-deploy.zip (non la cartella stessa)│"
echo "  │ 4. Assicurati che il frontend Docker NON sia più in esecuzione         │"
echo "  │    (vedi README_DEPLOY_PLESK.md sezione 5-filezilla)                  │"
echo "  └───────────────────────────────────────────────────────────────────────┘"
