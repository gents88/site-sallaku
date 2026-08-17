# Attivare Sentry e Redis (opzionali)

Entrambi sono già cablati nel codice e no-op se le relative env var sono
vuote. Questa guida è per quando vorrai accenderli davvero. Puoi fare
Sentry, Redis, o entrambi, in qualsiasi ordine — sono indipendenti.

---

## 1. Sentry — error tracking

### 1.1 Crea l'account e i due progetti

- [ ] Vai su https://sentry.io e crea un account gratuito (free tier: 5.000
      errori/mese, sufficiente per un portfolio).
- [ ] **Create Project** → piattaforma **Angular** → nome `portfolio-frontend`.
      Copia il DSN mostrato (formato `https://xxxx@oXXXXXX.ingest.sentry.io/XXXXX`).
- [ ] **Create Project** → piattaforma **Node.js / NestJS** → nome
      `portfolio-backend`. Copia anche questo DSN (sarà diverso dal primo).

### 1.2 Backend (env var su Railway — no rebuild locale)

- [ ] Railway → progetto → servizio **backend** → tab **Variables**.
- [ ] Aggiungi `SENTRY_DSN` = DSN del progetto Node copiato sopra.
- [ ] Railway fa il redeploy automatico. Controlla i log di boot: non deve
      comparire nessun errore relativo a Sentry.
- [ ] (Ripeti sullo stesso servizio anche per l'ambiente UAT se ne hai uno
      separato, con lo stesso DSN o uno dedicato a UAT se vuoi tenere gli
      errori separati per ambiente.)

### 1.3 Frontend (build-time — richiede rebuild + upload FileZilla)

Il frontend è statico: la env var non esiste a runtime, va quindi scritta
nel file d'ambiente prima della build.

- [ ] Apri `frontend/src/environments/environment.prod.ts`.
- [ ] Sostituisci `sentryDsn: ''` con `sentryDsn: '<il-DSN-Angular-copiato>'`.
- [ ] (Opzionale) fai lo stesso in `environment.uat.ts` se vuoi Sentry anche
      in UAT — usa lo stesso DSN o uno diverso a tua scelta.
- [ ] Rebuild: `cd frontend && npm run build:filezilla`.
- [ ] Carica il contenuto di `frontend/dist/portfolio-frontend/browser` su
      FileZilla come fai normalmente.

### 1.4 Verifica che funzioni

- [ ] Apri il sito in produzione, apri la console del browser e lancia:
      `throw new Error('test sentry frontend')`.
- [ ] Controlla su sentry.io → progetto `portfolio-frontend` → dovrebbe
      comparire l'evento entro pochi secondi.
- [ ] Per il backend, chiama temporaneamente un endpoint che sai rompere
      (es. un ID malformato che genera un 500 reale, non un 400 di
      validazione — solo i 5xx vengono inviati a Sentry) e controlla che
      compaia su sentry.io → progetto `portfolio-backend`.
- [ ] Fatto il test, puoi rimuovere/ignorare l'evento di prova da Sentry.

---

## 2. Redis — cache condivisa

Utile solo se: scali a più istanze backend su Railway, oppure vuoi che la
cache sopravviva ai redeploy invece di svuotarsi ogni volta. Se resti su
una singola istanza e non ti interessa, salta questa sezione — la cache
in-memory attuale va benissimo.

### 2.1 Provisiona Redis su Railway

- [ ] Nel progetto Railway → **+ New** → **Database** → **Add Redis**.
- [ ] Railway crea un nuovo servizio Redis nello stesso progetto (qualche
      secondo).

### 2.2 Collega il backend al servizio Redis

- [ ] Vai sul servizio **backend** → tab **Variables** → **+ New Variable**.
- [ ] Scegli **Add Reference** invece di scrivere un valore a mano, e
      seleziona il servizio Redis appena creato → variabile `REDIS_URL`.
      (Railway la tiene sincronizzata automaticamente se il servizio Redis
      cambia host/porta in futuro.)
- [ ] Railway fa il redeploy automatico del backend.

### 2.3 Verifica che funzioni

- [ ] Controlla i log di boot del backend su Railway: deve comparire la riga
      `Cache backend: Redis` (invece di `Cache backend: in-memory`).
- [ ] Se vedi invece un warning `Redis connect failed: ...`, ricontrolla che
      la reference in 2.2 punti al servizio giusto — il backend comunque
      non si rompe: gli errori Redis vengono loggati e le singole richieste
      di cache falliscono in modo silenzioso senza far cadere l'endpoint
      (vedi `backend/src/common/services/cache.service.ts`).

### 2.4 Nota costi

Il piano Redis di Railway consuma risorse del tuo piano (non è gratis
separatamente) — per un portfolio a basso traffico il costo aggiuntivo è
minimo, ma vale la pena controllarlo nella dashboard billing prima di
lasciarlo attivo a lungo termine se non ti serve davvero ancora.
