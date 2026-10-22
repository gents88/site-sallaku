#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  mongo-verify-backup.sh — Verifica che un backup si possa davvero ripristinare
#
#  USO (sul server):
#    ~/app/bin/mongo-verify-backup.sh [file.archive.gz]
#
#  Senza argomenti usa il dump più recente in ~/app/backups.
#
#  Ripristina il dump in un database TEMPORANEO (verify_restore_<ora>), confronta i
#  documenti per collezione con il database vivo e poi lo elimina. Non tocca mai
#  "portfolio": a differenza di mongo-restore.sh qui non c'è --drop sul database vero.
#
#  Esce con 0 se il backup è utilizzabile, 1 se non lo è: archivio illeggibile, backup
#  vuoto, oppure una collezione CRITICA (default: users, posts; cambiabile con
#  CRITICAL="users,posts,...") piena nel database vivo e vuota o assente nel dump.
#  Le altre differenze sono solo avvisi: il database vivo è andato avanti dopo il dump
#  notturno e può avere collezioni nate dopo (es. una funzione rilasciata nel frattempo).
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"
# shellcheck disable=SC1091
source "${APP}/shared/mongo.env"

ARCHIVE="${1:-$(ls -t "${APP}"/backups/mongo-backup-*.archive.gz 2>/dev/null | head -1 || true)}"
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || { echo "❌ Nessun dump da verificare in ${APP}/backups" >&2; exit 1; }

# Il server ha poca RAM e niente swap: meglio rinunciare che far intervenire l'OOM killer su mongod.
AVAILABLE_MB=$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)
if [[ "${AVAILABLE_MB:-0}" -lt 150 ]]; then
  echo "❌ Solo ${AVAILABLE_MB} MB di RAM disponibili: verifica rimandata (servono almeno 150 MB)." >&2
  exit 1
fi

TMP_DB="verify_restore_$(date +%Y%m%d%H%M%S)"
BASE_URI="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASS}@127.0.0.1:27017"
ROOT_URI="${BASE_URI}/?authSource=admin"

cleanup() {
  mongosh --quiet --norc "${BASE_URI}/${TMP_DB}?authSource=admin" --eval 'db.dropDatabase()' >/dev/null 2>&1 || true
}
trap cleanup EXIT

AGE_H=$(( ($(date +%s) - $(stat -c %Y "$ARCHIVE")) / 3600 ))
echo "▶ Verifica di $(basename "$ARCHIVE") ($(du -h "$ARCHIVE" | cut -f1), di ${AGE_H} ore fa)"
echo "  Ripristino nel database temporaneo ${TMP_DB} (portfolio non viene toccato)"

mongorestore --quiet --uri="$ROOT_URI" --archive="$ARCHIVE" --gzip \
  --nsInclude="portfolio.*" --nsFrom="portfolio.*" --nsTo="${TMP_DB}.*"

COUNTS_JS='
  const out = {};
  db.getCollectionNames().filter(c => !c.startsWith("system.")).forEach(c => { out[c] = db[c].countDocuments(); });
  print(JSON.stringify(out));'

RESTORED=$(mongosh --quiet --norc "${BASE_URI}/${TMP_DB}?authSource=admin" --eval "$COUNTS_JS")
LIVE=$(mongosh --quiet --norc "${BASE_URI}/portfolio?authSource=admin" --eval "$COUNTS_JS")

CRITICAL_COLLECTIONS="${CRITICAL:-users,posts}" RESTORED_JSON="$RESTORED" LIVE_JSON="$LIVE" node -e '
  const critical = new Set(process.env.CRITICAL_COLLECTIONS.split(",").map((c) => c.trim()).filter(Boolean));
  const restored = JSON.parse(process.env.RESTORED_JSON);
  const live = JSON.parse(process.env.LIVE_JSON);
  const names = [...new Set([...Object.keys(restored), ...Object.keys(live)])].sort();
  const pad = (s, n) => String(s).padEnd(n);
  let problems = 0, warnings = 0;

  console.log("\n  " + pad("collezione", 28) + pad("backup", 10) + pad("vivo", 10) + "esito");
  for (const c of names) {
    const r = restored[c], l = live[c];
    let note = "ok";
    const gap = (what) => {
      if (critical.has(c)) { problems++; return "CRITICA: " + what; }
      warnings++; return "avviso: " + what + " (nata dopo il dump?)";
    };
    if (r === undefined) note = l > 0 ? gap("manca nel backup, nel vivo " + l + " documenti") : "assente (vuota nel vivo)";
    else if (l === undefined) note = "solo nel backup (collezione rimossa dopo?)";
    else if (r === 0 && l > 0) note = gap("vuota nel backup, nel vivo " + l);
    else if (r !== l) note = (l - r > 0 ? "+" : "") + (l - r) + " dal dump";
    console.log("  " + pad(c, 28) + pad(r ?? "-", 10) + pad(l ?? "-", 10) + note);
  }
  const total = Object.values(restored).reduce((a, b) => a + b, 0);
  console.log("\n  Documenti nel backup: " + total + " in " + Object.keys(restored).length + " collezioni");
  if (Object.keys(restored).length === 0 || total === 0) { console.error("❌ Il backup ripristinato è vuoto."); process.exit(1); }
  if (problems > 0) { console.error("❌ " + problems + " collezioni CRITICHE (" + [...critical].join(", ") + ") con dati nel vivo e nulla nel backup."); process.exit(1); }
  console.log("✅ Backup utilizzabile" + (warnings ? " (" + warnings + " avvisi: collezioni nate dopo il dump)." : "."));
'
