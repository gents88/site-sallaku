#!/usr/bin/env bash
# Test di memory-alert.sh con memoria, stato e curl simulati: nessuna rete, nessun file fuori da una cartella temporanea.
# Uso: bash scripts/plesk/memory-alert.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/memory-alert.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/home/app/logs" "$TMP/home/app/shared"
export HOME="$TMP/home"
export MEMORY_ALERT_STATE="$TMP/state"
export MEMORY_ALERT_ENV="$TMP/backend.env"
export MEMINFO_FILE="$TMP/meminfo"
CURL_LOG="$TMP/curl.log"

printf 'RESEND_API_KEY=re_SEGRETO_DI_PROVA\nEMAIL_FROM=Gent <onboarding@resend.dev>\nEMAIL_TO=owner@example.com\n' > "$MEMORY_ALERT_ENV"

# curl finto: registra la richiesta e risponde 200 (o il codice in CURL_STATUS)
cat > "$TMP/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CURL_LOG"
# l'argomento dopo -d è il payload
while [[ $# -gt 0 ]]; do [[ "$1" == "-d" ]] && { shift; printf 'PAYLOAD %s\n' "$1" >> "$CURL_LOG"; }; shift; done
printf '%s' "${CURL_STATUS:-200}"
EOF
chmod +x "$TMP/bin/curl"
export PATH="$TMP/bin:$PATH" CURL_LOG

set_mem() { printf 'MemTotal:        1877000 kB\nMemAvailable:    %d kB\n' "$(( $1 * 1024 ))" > "$MEMINFO_FILE"; }
mails() { grep -c '^PAYLOAD' "$CURL_LOG" 2>/dev/null || true; }
reset() { rm -f "$MEMORY_ALERT_STATE" "$CURL_LOG"; touch "$CURL_LOG"; }

PASS=0; FAIL=0
check() { # descrizione, atteso, effettivo
  if [[ "$2" == "$3" ]]; then PASS=$((PASS+1)); echo "  ✔ $1"; else FAIL=$((FAIL+1)); echo "  ✘ $1 (atteso: $2, ottenuto: $3)"; fi
}
run() { bash "$SCRIPT" "$@" >/dev/null 2>&1; }

echo "memory-alert.sh"

reset; set_mem 400; run; run; run
check "memoria normale: nessuna email" 0 "$(mails)"

reset; set_mem 80; run
check "un solo controllo basso: nessuna email (potrebbe essere un picco)" 0 "$(mails)"

reset; set_mem 80; run; run
check "due controlli bassi di fila: una email" 1 "$(mails)"

reset; set_mem 80; run; run; run; run; run
check "memoria che resta bassa: niente email ripetute entro la pausa" 1 "$(mails)"

reset; set_mem 80; run; set_mem 400; run; set_mem 80; run
check "un controllo basso, uno normale, uno basso: il contatore riparte, nessuna email" 0 "$(mails)"

reset; set_mem 80; run; run
printf 'last_alert=%s\n' "$(( $(date +%s) - 13*3600 ))" >> "$MEMORY_ALERT_STATE"
run
check "dopo 13 ore (pausa di 12) torna a avvisare" 2 "$(mails)"

reset; set_mem 80; run; run; set_mem 150; run
check "tra la soglia di allarme e quella di rientro: nessuna email di rientro" 1 "$(mails)"

reset; set_mem 80; run; run; set_mem 300; run
check "rientrata sopra 200 MB dopo un avviso: seconda email" 2 "$(mails)"
set_mem 300; run
check "e la email di rientro non si ripete" 2 "$(mails)"

reset; set_mem 300; run; run
check "memoria normale senza avvisi precedenti: nessuna email di rientro" 0 "$(mails)"

reset; set_mem 80; run; run
check "l'email va al destinatario configurato" 1 "$(grep '^PAYLOAD' "$CURL_LOG" | grep -c 'owner@example.com')"
check "il segreto è nell'intestazione, non nel testo dell'email" 0 "$(grep '^PAYLOAD' "$CURL_LOG" | grep -c 'SEGRETO_DI_PROVA')"

reset; set_mem 80; CURL_STATUS=500 run; CURL_STATUS=500 run
check "se l'invio fallisce non registra l'avviso come mandato" 0 "$(grep -c '^last_alert=' "$MEMORY_ALERT_STATE")"
run
check "…e al controllo successivo ritenta (un tentativo fallito + uno riuscito)" 2 "$(mails)"

reset; set_mem 80; run --dry-run
check "--dry-run non chiama curl" 0 "$(mails)"

reset; set_mem 400; run --test
check "--test invia subito un'email di prova anche con memoria normale" 1 "$(mails)"
check "--test non tocca lo stato" 0 "$([[ -f "$MEMORY_ALERT_STATE" ]] && echo 1 || echo 0)"

reset; set_mem 80; LOW_MB=50 run; LOW_MB=50 run
check "la soglia LOW_MB è configurabile" 0 "$(mails)"

reset; rm "$MEMORY_ALERT_ENV"; set_mem 80; run; run
check "senza configurazione email non fallisce e non invia" 0 "$(mails)"

echo; echo "Passati: $PASS  Falliti: $FAIL"
[[ "$FAIL" -eq 0 ]]
