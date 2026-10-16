#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  build-backend-bundle.sh — Compila il backend in un .tgz pronto per Plesk
#
#  Il bundle contiene dist/ + node_modules di produzione compilati per Linux
#  x64 (glibc): il server Plesk non compila nulla (1.8 GB di RAM non bastano
#  per `nest build`) e sharp / @napi-rs/canvas hanno binari nativi, quindi
#  node_modules non può venire da macOS.
#
#  USO:
#    ./scripts/build-backend-bundle.sh /percorso/backend-bundle.tgz
#
#  Su Linux (CI GitHub, ubuntu-24.04) compila direttamente con il Node
#  installato; su macOS dentro un container node:24-bookworm (serve Docker /
#  colima attivo).
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Build vera e propria (eseguita su Linux, nativo o nel container) ──
if [[ "${1:-}" == "--inner" ]]; then
  SRC="$2"; OUT="$3"
  WORK="$(mktemp -d)"
  tar -C "$SRC" --exclude=node_modules --exclude=dist --exclude='.env*' --exclude=coverage -cf - . | tar -C "$WORK" -xf -
  cd "$WORK"
  npm ci --loglevel=error
  NODE_OPTIONS="--max-old-space-size=3072" npm run build
  mkdir stage
  cp -r dist package.json package-lock.json .npmrc stage/
  cd stage
  npm ci --omit=dev --loglevel=error
  tar czf "$OUT" .
  rm -rf "$WORK"
  exit 0
fi

OUT="${1:?Uso: $0 <file-di-output.tgz>}"
OUT_DIR="$(cd "$(dirname "$OUT")" && pwd)"
OUT_NAME="$(basename "$OUT")"

echo "→ Build del backend (Linux x64)..."
if [[ "$(uname -s)" == "Linux" ]]; then
  "$0" --inner "${ROOT_DIR}/backend" "${OUT_DIR}/${OUT_NAME}"
else
  if ! docker info &>/dev/null; then
    echo "❌ Docker non attivo: avvia colima (colima start) o Docker Desktop." >&2
    exit 1
  fi
  # colima condivide con i container solo la home: il bundle si scrive in una
  # cartella del progetto (in .gitignore) e poi si sposta dove richiesto.
  STAGE="${ROOT_DIR}/.bundle-build"
  mkdir -p "$STAGE"
  # glibc (bookworm), non alpine/musl: il server è Ubuntu 24.04
  docker run --rm --platform linux/amd64 \
    -v "${ROOT_DIR}/backend:/src:ro" \
    -v "${ROOT_DIR}/scripts/build-backend-bundle.sh:/build.sh:ro" \
    -v "${STAGE}:/out" \
    node:24-bookworm \
    bash /build.sh --inner /src "/out/${OUT_NAME}"
  [[ "${STAGE}/${OUT_NAME}" -ef "${OUT_DIR}/${OUT_NAME}" ]] || mv "${STAGE}/${OUT_NAME}" "${OUT_DIR}/${OUT_NAME}"
fi

[[ -s "${OUT_DIR}/${OUT_NAME}" ]] || { echo "❌ Bundle non generato: ${OUT_DIR}/${OUT_NAME}" >&2; exit 1; }

echo "✅ Bundle: ${OUT_DIR}/${OUT_NAME} ($(du -h "${OUT_DIR}/${OUT_NAME}" | cut -f1))"
