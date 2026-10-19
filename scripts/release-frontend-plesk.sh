#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  release-frontend-plesk.sh — Rilascia il frontend su Plesk
#
#  Lo usa la CI a ogni push su main (job deploy-frontend) e si può lanciare
#  a mano dal Mac al posto dell'upload FileZilla. Carica con rsync via SSH una
#  build già fatta (`npm run build:prod` in frontend/) in ~/httpdocs, poi
#  controlla che il sito e il proxy verso il backend rispondano.
#
#  Come l'upload FileZilla non cancella nulla sul server: i chunk delle build
#  precedenti restano, così chi ha il sito già aperto non trova file mancanti.
#  Unica eccezione: le copie precompresse .br/.gz che la build non contiene,
#  che Apache servirebbe al posto della pagina appena caricata (vedi le regole
#  "Pre-compressed assets" in frontend/public/.htaccess).
#
#  USO (dalla root del progetto):
#    ./scripts/release-frontend-plesk.sh [cartella della build]
#    (default: frontend/dist/portfolio-frontend/browser)
#
#  CONFIGURAZIONE — variabili d'ambiente oppure .env.deploy (in .gitignore):
#    PLESK_SSH=plesk-gentsallaku      # utente@host SSH (o alias di ~/.ssh/config)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  source .env.deploy
fi

PLESK_SSH="${PLESK_SSH:?PLESK_SSH non impostata (in .env.deploy o come variabile)}"
DIST="${1:-frontend/dist/portfolio-frontend/browser}"
WEBROOT=httpdocs   # relativa alla home dell'utente di dominio
SITE=https://gentsallaku.it

[[ -d "$DIST" ]] || { echo "❌ Build non trovata: $DIST (prima: cd frontend && npm run build:prod)" >&2; exit 1; }

# Con SSR l'application builder scrive index.csr.html invece di index.html.
# Servono entrambi: index.html per "/", index.csr.html per il fallback SPA
# del .htaccess (come in build-frontend-filezilla.sh)
if [[ ! -f "$DIST/index.html" && -f "$DIST/index.csr.html" ]]; then
  cp "$DIST/index.csr.html" "$DIST/index.html"
fi
if [[ ! -f "$DIST/index.csr.html" && -f "$DIST/index.html" ]]; then
  cp "$DIST/index.html" "$DIST/index.csr.html"
fi

# Il .htaccess porta con sé il proxy verso il backend: senza, /api e la chat live smettono di funzionare
grep -q '127.0.0.1:3000' "$DIST/.htaccess" 2>/dev/null \
  || { echo "❌ $DIST/.htaccess manca o non ha le regole proxy verso il backend" >&2; exit 1; }

MAIN="$(grep -o 'main-[A-Z0-9]*\.js' "$DIST/index.html" | head -1 || true)"
[[ -n "$MAIN" ]] || { echo "❌ $DIST/index.html non carica nessun main-*.js" >&2; exit 1; }

echo ""
echo "══════════════════════════════════════════════"
echo "  Rilascio frontend ${MAIN} → ${PLESK_SSH}:${WEBROOT}"
echo "══════════════════════════════════════════════"

# --checksum: la build scaricata dalla CI ha tutte le date nuove, così si
# caricano solo i file cambiati davvero. Senza -t le date sul server diventano
# quelle del caricamento (Last-Modified giusto per i file cambiati).
RSYNC=(rsync -rlz --checksum --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r)

# .htaccess attuale da parte: se dopo il rilascio il sito non risponde si rimette
ssh "$PLESK_SSH" "cp -p ${WEBROOT}/.htaccess app/htaccess.prev 2>/dev/null || true"

# Prima gli asset (chunk con l'hash nel nome, traduzioni, immagini): le pagine
# nuove li caricano, quindi devono già esserci quando arrivano le pagine
echo "→ 1/3 asset..."
"${RSYNC[@]}" --exclude='*.html' --exclude='.htaccess' --exclude='ngsw.json' "$DIST/" "${PLESK_SSH}:${WEBROOT}/"

echo "→ 2/3 pagine e .htaccess..."
"${RSYNC[@]}" --exclude='ngsw.json' "$DIST/" "${PLESK_SSH}:${WEBROOT}/"

# Per ultimo il manifest del service worker: appena cambia i browser scaricano
# la versione nuova, che a questo punto è già tutta sul server
echo "→ 3/3 service worker..."
"${RSYNC[@]}" "$DIST/ngsw.json" "${PLESK_SSH}:${WEBROOT}/"

# Copie .br/.gz rimaste da build precedenti (scripts/precompress.js): Apache
# le preferisce al file appena caricato e ai browser arriverebbe la pagina vecchia
PRECOMPRESSED='\.(js|mjs|css|html|json|svg|xml|txt|webmanifest)\.(br|gz)$'
STALE="$(LC_ALL=C comm -13 \
  <(cd "$DIST" && find . -type f \( -name '*.br' -o -name '*.gz' \) | LC_ALL=C sort) \
  <(ssh "$PLESK_SSH" "cd ${WEBROOT} && find . -type f \( -name '*.br' -o -name '*.gz' \)" | LC_ALL=C sort) \
  | grep -E "$PRECOMPRESSED" || true)"
if [[ -n "$STALE" ]]; then
  echo "→ Rimuovo $(wc -l <<<"$STALE" | tr -d ' ') copie precompresse di build precedenti..."
  ssh "$PLESK_SSH" "cd ${WEBROOT} && xargs -r -d '\n' rm -f --" <<<"$STALE"
fi

echo "→ Verifica..."
# grep senza -q: con pipefail, un grep che esce al primo match fa fallire curl (SIGPIPE)
check() {
  curl -fsS --max-time 20 "${SITE}/" | grep -F -- "$MAIN" >/dev/null \
    && curl -fsS --max-time 20 --compressed "${SITE}/about" | grep -F -- "$MAIN" >/dev/null \
    && curl -fsS --max-time 20 "${SITE}/api/v1/system/health" | grep -F '"ok":true' >/dev/null
}
for attempt in 1 2 3; do
  if check; then
    echo ""
    echo "✅ ${SITE} serve ${MAIN} e /api/v1 arriva al backend."
    exit 0
  fi
  sleep 10
done

echo "❌ Dopo il rilascio ${SITE} non serve ${MAIN} o /api/v1 non arriva al backend." >&2
echo "   Rimetto il .htaccess precedente. Le pagine nuove restano: per tornare alla" >&2
echo "   versione precedente, su GitHub Actions apri la CI di quel commit → Re-run all jobs." >&2
ssh "$PLESK_SSH" "[ -f app/htaccess.prev ] && cp -p app/htaccess.prev ${WEBROOT}/.htaccess" || true
exit 1
