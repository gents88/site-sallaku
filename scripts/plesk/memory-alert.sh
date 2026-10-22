#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  memory-alert.sh — avvisa per email quando il server sta finendo la RAM
#
#  Cron: ogni 5 minuti (vedi setup-server.sh). Il server ha ~1,8 GB e niente swap: quando la
#  memoria disponibile scende troppo, pm2 riavvia il backend e, nel caso peggiore, l'OOM killer
#  uccide mongod. Il watchdog rialza i processi ma non ti dice che è successo, né perché.
#
#  Logica:
#   - MemAvailable (/proc/meminfo) sotto LOW_MB per 2 controlli di fila (≥ 5 minuti) → email
#   - non più di un'email ogni COOLDOWN_H ore, per non riempire la casella se resta basso
#   - quando torna sopra RECOVER_MB dopo un avviso, una seconda email "rientrata"
#   - l'email elenca i processi che usano più memoria
#
#  Soglie sovrascrivibili da ambiente: LOW_MB (default 120), RECOVER_MB (200), COOLDOWN_H (12).
#  Prova: `memory-alert.sh --test` invia subito un'email di prova; `--dry-run` stampa soltanto.
# ─────────────────────────────────────────────────────────────

set -uo pipefail

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"

LOW_MB="${LOW_MB:-120}"
RECOVER_MB="${RECOVER_MB:-200}"
COOLDOWN_H="${COOLDOWN_H:-12}"
# I percorsi si possono sovrascrivere solo per i test (memory-alert.test.sh).
STATE="${MEMORY_ALERT_STATE:-${APP}/logs/.memory-alert.state}"   # righe: low_count=N, last_alert=EPOCH, alerting=0|1
ENV_FILE="${MEMORY_ALERT_ENV:-${APP}/shared/backend.env}"
MEMINFO="${MEMINFO_FILE:-/proc/meminfo}"
MODE="${1:-}"

available_mb() { awk '/MemAvailable/ {print int($2/1024)}' "$MEMINFO"; }
total_mb()     { awk '/MemTotal/ {print int($2/1024)}' "$MEMINFO"; }

state_get() { grep -E "^$1=" "$STATE" 2>/dev/null | tail -1 | cut -d= -f2; }
state_set() { # chiave valore
  touch "$STATE"
  grep -v -E "^$1=" "$STATE" > "${STATE}.tmp" 2>/dev/null || true
  echo "$1=$2" >> "${STATE}.tmp"
  mv "${STATE}.tmp" "$STATE"
}

env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d "\"'"; }

top_processes() {
  ps -eo rss,comm --sort=-rss 2>/dev/null | head -6 | awk 'NR>1 {printf "  %5d MB  %s\n", $1/1024, $2}'
}

send_mail() { # oggetto, testo
  local subject="$1" body="$2"
  if [[ "$MODE" == "--dry-run" ]]; then
    printf '— DRY RUN —\nOggetto: %s\n\n%s\n' "$subject" "$body"
    return 0
  fi
  local key from to
  key="$(env_get RESEND_API_KEY)"; from="$(env_get EMAIL_FROM)"; to="$(env_get EMAIL_TO)"
  if [[ -z "$key" || -z "$to" ]]; then
    echo "$(date -u +%FT%TZ) impossibile avvisare: RESEND_API_KEY o EMAIL_TO mancanti in backend.env" >&2
    return 1
  fi
  [[ -n "$from" ]] || from="Gent Sallaku <onboarding@resend.dev>"

  # JSON costruito con node: oggetto e testo possono contenere virgolette e a capo.
  local payload
  payload=$(FROM="$from" TO="$to" SUBJECT="$subject" BODY="$body" node -e '
    process.stdout.write(JSON.stringify({ from: process.env.FROM, to: [process.env.TO], subject: process.env.SUBJECT, text: process.env.BODY }));')
  local status
  status=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' https://api.resend.com/emails \
    -H "Authorization: Bearer ${key}" -H 'Content-Type: application/json' -d "$payload") || status=000
  if [[ "$status" != 2* ]]; then
    echo "$(date -u +%FT%TZ) email non inviata (HTTP ${status})" >&2
    return 1
  fi
  echo "$(date -u +%FT%TZ) email inviata: ${subject}"
}

report() { # intestazione
  printf '%s\n\nMemoria disponibile: %s MB su %s MB (soglia di allarme: %s MB)\nSwap: nessuna\n\nProcessi che usano più memoria:\n%s\n\nControlla: ssh plesk-gentsallaku "pm2 ls; free -m"\nIl watchdog (cron ogni minuto) rialza da solo mongod e backend se vengono terminati.\n' \
    "$1" "$(available_mb)" "$(total_mb)" "$LOW_MB" "$(top_processes)"
}

if [[ "$MODE" == "--test" || "$MODE" == "--dry-run" ]]; then
  send_mail "[TEST] Avviso memoria server gentsallaku.it" "$(report 'Questa è una prova: non c'"'"'è nessun problema di memoria.')"
  exit $?
fi

AVAIL="$(available_mb)"
LOW_COUNT="$(state_get low_count)"; LOW_COUNT="${LOW_COUNT:-0}"
LAST_ALERT="$(state_get last_alert)"; LAST_ALERT="${LAST_ALERT:-0}"
ALERTING="$(state_get alerting)"; ALERTING="${ALERTING:-0}"
NOW="$(date +%s)"

if [[ "$AVAIL" -lt "$LOW_MB" ]]; then
  LOW_COUNT=$((LOW_COUNT + 1))
  state_set low_count "$LOW_COUNT"
  echo "$(date -u +%FT%TZ) memoria bassa: ${AVAIL} MB (controllo ${LOW_COUNT})"
  if [[ "$LOW_COUNT" -ge 2 && $((NOW - LAST_ALERT)) -ge $((COOLDOWN_H * 3600)) ]]; then
    if send_mail "Memoria quasi esaurita sul server (${AVAIL} MB)" "$(report "La memoria disponibile è sotto ${LOW_MB} MB da almeno 5 minuti.")"; then
      state_set last_alert "$NOW"
      state_set alerting 1
    fi
  fi
else
  state_set low_count 0
  if [[ "$ALERTING" == "1" && "$AVAIL" -ge "$RECOVER_MB" ]]; then
    if send_mail "Memoria del server rientrata (${AVAIL} MB)" "$(report 'La memoria disponibile è tornata a livelli normali.')"; then
      state_set alerting 0
    fi
  fi
fi
