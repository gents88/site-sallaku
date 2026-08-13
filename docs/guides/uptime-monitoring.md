# Uptime monitoring del backend (Railway)

Il backend espone già un endpoint pubblico e leggero pensato per un liveness
check esterno:

```
GET https://<il-tuo-backend>.up.railway.app/api/v1/system/health
```

Definito in `backend/src/system/system.controller.ts`. Caratteristiche:

- Nessuna autenticazione richiesta (`@Get('health')` senza guard).
- Nessun dato sensibile nella risposta (solo `ok`, `service`, `version`, `startedAt`).
- Nessuna query al database — risponde anche se Mongo è irraggiungibile, quindi
  è un vero *liveness* check (il processo Node è vivo), non un *readiness*
  check (non dice se il DB è raggiungibile). Per ora va bene così: se il
  processo è su ma il DB è giù, gli endpoint applicativi risponderanno 500 e
  Sentry (vedi sotto) lo segnalerà comunque.

Risposta attesa (200 OK):

```json
{
  "ok": true,
  "service": "portfolio-backend",
  "version": "1.0.0",
  "startedAt": "2026-08-13T10:00:00.000Z"
}
```

## Rate limiting — nessun problema per un monitor esterno

Il `ThrottlerGuard` globale (`backend/src/app.module.ts`) applica un default
di **60 richieste / 60s per IP**. Un monitor esterno che fa ping ogni 1-5
minuti resta ampiamente sotto soglia — non serve nessuna eccezione o
override per questa rotta.

## Setup con UptimeRobot (gratuito)

1. Crea un account su https://uptimerobot.com (piano free: fino a 50 monitor,
   check ogni 5 minuti).
2. **Add New Monitor**:
   - Monitor Type: `HTTP(s)`
   - Friendly Name: `Portfolio Backend — health`
   - URL: `https://<il-tuo-backend>.up.railway.app/api/v1/system/health`
   - Monitoring Interval: 5 minuti
3. **Alert Contacts**: aggiungi il tuo indirizzo email come contatto e
   abilitalo su questo monitor.
4. (Opzionale) In "Advanced Settings" puoi aggiungere una keyword check sul
   body (`"ok":true`) così un 200 con payload inatteso viene comunque
   segnalato come down.

## Alternativa: Better Stack (ex Better Uptime)

1. Crea un account su https://betterstack.com/uptime (piano free: 10 monitor,
   check ogni 3 minuti, status page inclusa).
2. **Create monitor** → HTTP monitor sull'URL sopra, intervallo 3 minuti.
3. Collega un canale email in **On-call** → **Escalation policy** con il tuo
   indirizzo.
4. Se vuoi una status page pubblica (utile per un portfolio/uno showcase),
   Better Stack la genera automaticamente dai monitor collegati.

Entrambi i servizi mandano anche un alert di "back up" quando il sito torna
raggiungibile, non solo quello di down.

## Perché non basta solo Sentry

Sentry (vedi `SENTRY_DSN` in `.env.example`) cattura eccezioni **mentre il
processo gira**. Se Railway killa il container, se il boot fallisce (es.
`validateRequiredEnv()` in `main.ts` lancia per una env mancante), o se il
DNS/routing è rotto, il processo non emette nessun evento Sentry — a quel
punto solo un ping esterno periodico se ne accorge. I due strumenti sono
complementari, non sovrapposti.
