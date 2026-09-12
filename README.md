# Gent Sallaku – Portfolio

> Senior Front-End Developer | Angular · TypeScript · Data Visualization & 3D Web
>
> Sito in produzione: **[gentsallaku.it](https://gentsallaku.it)**

Portfolio professionale e piattaforma personale: SPA **Angular 21** + API **NestJS 11** su **MongoDB**,
con pannello admin, blog multilingua, chatbot AI e una suite di strumenti PDF/AI.

---

## 📚 Documentazione

**➜ [Documentazione completa in `/docs`](./docs/README.md)**

| Area | Documento |
|---|---|
| Setup iniziale | [Quick Start](./docs/QUICK_START.md) |
| Deploy | [deploy-plesk.md](./docs/guides/deploy-plesk.md) |
| Email | [email-setup.md](./docs/guides/email-setup.md) |
| Sentry & Redis | [sentry-redis-setup.md](./docs/guides/sentry-redis-setup.md) |
| Search Console | [search-console.md](./docs/guides/search-console.md) |
| Testing | [testing-new-features.md](./docs/guides/testing-new-features.md) · [mobile-testing.md](./docs/guides/mobile-testing.md) |
| Uptime | [uptime-monitoring.md](./docs/guides/uptime-monitoring.md) |
| SEO | [strategy.md](./docs/seo/strategy.md) · [implementation.md](./docs/seo/implementation.md) |
| Architettura | [improvements.md](./docs/architecture/improvements.md) |
| Checklist | [weekly.md](./docs/checklists/weekly.md) |
| Template articoli | [blog-article.md](./docs/templates/blog-article.md) |

Il **sistema Note del blog** ha documentazione dedicata nei file `NOTES_*.md` in root
([architettura](./NOTES_ARCHITECTURE.md), [riepilogo](./NOTES_SUMMARY.md),
[setup](./NOTES_FEATURE_SETUP.md), [integrazione](./NOTES_INTEGRATION_GUIDE.md),
[checklist](./NOTES_CHECKLIST.md), [esempi API](./NOTES_API_EXAMPLES.sh)).

---

## 📁 Struttura del repository

```
frontend/            → Angular 21 SPA (standalone, signals, SSR-capable)
backend/             → NestJS 11 REST API + WebSocket gateway
docs/                → Documentazione (guide, SEO, checklist, template)
scripts/             → Build, deploy, sitemap, backup Mongo, ottimizzazione asset
.github/workflows/   → CI, generazione sitemap, backup MongoDB
index.html           → Landing page statica legacy (vedi nota sotto)
server.js            → Express standalone: static host + /api/send-email + /sitemap.xml
docker-compose*.yml  → Stack locale / prod / uat / plesk
Dockerfile           → Immagine backend usata da Railway
railway.json         → Config deploy Railway (builder DOCKERFILE)
```

> **Nota su `index.html` + `server.js`**: sono la prima versione del sito (landing statica
> con i18n via attributi `data-i18n`) più un mailer Express. Non fanno parte della SPA
> Angular e non sono ciò che serve `gentsallaku.it` oggi. Restano nel repo come fallback.

---

## 🚀 Quick Start

### Sviluppo locale

```bash
# Terminal 1 — Backend  (→ http://localhost:3001/api/v1)
cd backend
cp .env.example .env      # compila i valori; imposta PORT=3001
npm install
npm run start:dev

# Terminal 2 — Frontend (→ http://localhost:4200)
cd frontend
npm install
npm start
```

In alternativa `./start-local.sh` in root avvia backend e frontend insieme, terminando
prima eventuali processi orfani. Attenzione: **non avvia un MongoDB locale** — punta al
database `portfolio_dev` ospitato su Railway, condiviso con l'ambiente di sviluppo.

> ⚠️ **Porta**: `main.ts` e `.env.example` usano `3000` come default, ma il frontend in
> sviluppo (`environment.ts`) chiama `http://localhost:3001`. Imposta `PORT=3001` in
> `backend/.env`, altrimenti le chiamate API falliscono in locale.

| Servizio | URL |
|---|---|
| Angular app | http://localhost:4200 |
| NestJS API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/api/docs |
| Admin | http://localhost:4200/dashboard/login |

### Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

---

## ✨ Funzionalità

### Sito pubblico

| Sezione | Route | Contenuto |
|---|---|---|
| Home | `/` | Hero, About, Tech Stack, Esperienza, Soft Skills, Servizi |
| Progetti | `/projects` | Project card con dettaglio |
| Blog | `/blog`, `/blog/:slug` | Post slug-based, tag, paginazione server-side, note dei lettori |
| Feed RSS | `/rss.xml` | Generato staticamente da `scripts/generate-rss.js`, stesso ciclo di `sitemap.yml` |
| Testimonianze | `/testimonials` | Invio pubblico + moderazione admin |
| Contatti | `/contact` | Form con invio email (Resend/SMTP) e protezione Turnstile |
| Ricerca | `/search` | Ricerca full-text sul sito con suggerimenti |

### 🧪 Lab — strumenti PDF & AI (`/lab`)

| Tool | Route |
|---|---|
| Riepilogo PDF con AI | `/lab/pdf-summary` |
| Formattazione testo AI | `/lab/ai-formatter` |
| Traduzione PDF | `/lab/pdf-translate` |
| Generazione presentazioni | `/lab/ai-ppt` |
| Ricerca PDF (Gutenberg, arXiv, PMC) | `/lab/pdf-search` |
| Conversione file | `/lab/convert` |
| Editor PDF | `/lab/pdf-editor` |
| Viewer | `/lab/viewer` |
| Editor testo | `/lab/editor` |
| OCR | `/lab/ocr` |
| Scanner | `/lab/scanner` |
| Workspace | `/lab/workspace` |
| Libreria | `/lab/library` |

### 🤖 Chatbot & live handoff

- Chatbot AI sul sito pubblico, con sessioni persistite e transcript via email.
- **Live handoff**: se l'utente chiede di parlare con una persona, un popup raccoglie
  la richiesta e apre una **chat live via WebSocket** (Socket.IO) verso l'admin.
- Rate limit configurabile (`LIVE_HANDOFF_MAX_PER_DAY`, `LIVE_HANDOFF_TIMEOUT_MINUTES`).

### 🔐 Admin dashboard (`/dashboard`)

CRUD completo su Progetti, Esperienze, About, Blog, Note, Testimonianze; inbox contatti
paginata; analytics con export CSV; audit trail; gestione cron; stato sistema.
Login con password **oppure OTP** via email/SMS (`/dashboard/login/otp`).

### 🌍 Multilingua (i18n)

**7 lingue**: 🇮🇹 Italiano (default) · 🇬🇧 English · 🇦🇱 Shqip · 🇪🇸 Español · 🇵🇹 Português · 🇫🇷 Français · 🇩🇪 Deutsch

- Dizionari JSON in `frontend/public/i18n/<lang>.json`.
- **Prefisso URL per lingua**: l'italiano non ha prefisso (`/blog`), le altre sì (`/en/blog`).
  Gestito da `lang.resolver.ts` e `lang-can-match.guard.ts`.
- Rilevamento lingua da geo-IP con fallback su `navigator.language`, scelta persistita.
- Switcher nella navbar (`lang-switcher`).

> ⚠️ **Regola**: ogni `routerLink` pubblico deve passare per la pipe `| langUrl`,
> altrimenti la navigazione si rompe per gli utenti non italiani.

### 🎨 Design & UX

- Tema **dark/light** con Angular Signals + persistenza localStorage.
- **UI platform-adaptive**: `PlatformUiService` marca `<html>` con `data-os` (iOS/Android)
  per adattare i componenti. Le regole CSS scoped su questi attributi richiedono
  `:host-context()`, altrimenti non hanno effetto.
- Glassmorphism, animazioni leggere, supporto `prefers-reduced-motion`.
- Responsive mobile-first con Angular Material.
- Banner consenso cookie con storico e statistiche lato backend.

---

## 🧱 Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Frontend | Angular 21 (standalone, signals, OnPush), Angular Material 21, `@angular/ssr`, RxJS 7, SCSS, pdfjs-dist 6, socket.io-client 4 |
| Backend | NestJS 11, Mongoose 8, Passport JWT, bcrypt, Socket.IO 4, Swagger, Resend/Nodemailer, Twilio, pdf-lib, pdf-parse, tesseract.js, sharp |
| AI | Provider configurabile via env — OpenAI-compatible, Gemini, Groq |
| Database | MongoDB (`portfolio_dev` / `portfolio_uat` / `portfolio_prod`) |
| Cache/Queue | Redis (opzionale, `REDIS_URL`) |
| Monitoring | Sentry (`SENTRY_DSN`), endpoint `/system/health` e `/system/ops` |
| CI/CD | GitHub Actions + Railway (backend) + upload statico (frontend) |

---

## 🏛️ Architettura & flussi

```
                    ┌──────────────────────────┐
                    │   Browser (Angular 21)   │
                    │  SPA · signals · OnPush  │
                    └───┬──────────────────┬───┘
                        │ REST /api/v1     │ WebSocket
                        │ (JWT Bearer)     │ (Socket.IO)
                    ┌───▼──────────────────▼───┐
                    │      NestJS 11 API       │
                    │  Guards · Interceptors   │
                    │  Filters · Throttler     │
                    └─┬────────┬────────┬──────┘
                      │        │        │
              ┌───────▼──┐  ┌──▼───┐  ┌─▼─────────────────┐
              │ MongoDB  │  │Redis │  │ Servizi esterni   │
              │ Mongoose │  │(opz.)│  │ AI · Resend/SMTP  │
              └──────────┘  └──────┘  │ Twilio · Turnstile│
                                      │ Sentry · GSC      │
                                      └───────────────────┘
```

### Flusso di autenticazione

1. **Login** — email + password (bcrypt) → access token + refresh token.
2. **OTP (alternativa)** — richiesta codice via email o SMS, rate limit, verifica entro 5 minuti.
3. **Refresh** — alla scadenza dell'access token il refresh token (salvato hashato) genera
   una nuova coppia; il vecchio viene invalidato.
4. **Riuso** — l'utente ha un solo `refreshTokenHash` in DB: se viene presentato un refresh
   token che non corrisponde all'hash salvato, l'hash viene azzerato e la sessione revocata.
5. **Autorizzazione** — `JwtAuthGuard` + `RolesGuard` con `@Roles` sulle rotte admin.
6. **Logout** — revoca lato server + pulizia storage lato client, sincronizzata tra le tab.

### Perché queste scelte

- **Angular** — signals e standalone components, escaping XSS di default, ecosistema maturo.
- **NestJS** — architettura modulare con DI, validazione dichiarativa via decoratori,
  guard/interceptor/filter come primitive di sicurezza trasversali.
- **MongoDB** — schema flessibile, adatto a contenuti eterogenei (post, note, sessioni chat).
- **Railway** — deploy da Dockerfile senza gestire infrastruttura, ambienti prod/uat separati.

---

## 🚢 Deploy

> **Importante**: la produzione **non** gira su Docker/Plesk nonostante i `docker-compose.*.yml`
> presenti in repo. La realtà è: **frontend statico** caricato via FTP + **backend su Railway**.

### Frontend → hosting statico

```bash
cd frontend
npm run build:filezilla     # build prod + rinomina index.csr.html + precompressione gzip/brotli
```

Oppure `./scripts/build-frontend-filezilla.sh`, che produce `frontend-deploy.zip` in root.

Carica il **contenuto** di `frontend/dist/portfolio-frontend/browser/` nella web root del dominio
(`/var/www/vhosts/gentsallaku.it/httpdocs/`).

- Mantieni il `.htaccess` generato: abilita il routing SPA (`/dashboard/login` → `index.html`).
- **Rimuovi i file vecchi** prima di caricare: asset hashati stantii rompono l'app.
- Nessun reverse proxy per `/api`: il build di produzione punta in assoluto a Railway
  (`environment.prod.ts`).

### Backend → Railway

Deploy dal `Dockerfile` in root (`railway.json`, start `node dist/main`).
Ambienti: **prod** e **uat**, con `MONGODB_URI` distinti per database.

| Ambiente | apiUrl frontend |
|---|---|
| dev | `http://localhost:3001/api/v1` |
| uat | `https://portfolio-backend-uat.up.railway.app/api/v1` |
| prod | `https://portfolio-backend-production-e76d.up.railway.app/api/v1` |

---

## ⚙️ Variabili d'ambiente (`backend/.env`)

Vedi `backend/.env.example`, `.env.prod.example`, `.env.uat.example`.

### Core
| Variabile | Esempio | Descrizione |
|---|---|---|
| `PORT` | `3001` | Porta API (`.env.example` dice `3000`, ma il frontend dev si aspetta `3001`) |
| `NODE_ENV` | `development` | Ambiente |
| `MONGODB_URI` | `mongodb://localhost:27017/portfolio_dev` | Connessione MongoDB — **specifica sempre il database**, altrimenti Mongoose usa `test` |
| `CORS_ORIGIN` | `http://localhost:4200` | Origini CORS ammesse |
| `FRONTEND_URL` | `https://gentsallaku.it` | Base URL usata nei link delle email |

### Auth
| Variabile | Descrizione |
|---|---|
| `JWT_SECRET` | Secret di firma JWT (stringa lunga e casuale) |
| `JWT_EXPIRES_IN` | Scadenza access token (impostato a `7d` in tutti gli `.env.example`) |
| `ADMIN_EMAIL` · `ADMIN_NAME` · `ADMIN_PASSWORD` | Seed dell'utente admin al primo avvio |

### Email & SMS
| Variabile | Descrizione |
|---|---|
| `RESEND_API_KEY` | API key Resend (provider preferito) |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_SECURE` · `SMTP_USER` · `SMTP_PASS` | Fallback SMTP |
| `EMAIL_FROM` · `EMAIL_TO` | Mittente e destinatario dei messaggi di contatto |
| `TWILIO_ACCOUNT_SID` · `TWILIO_AUTH_TOKEN` · `TWILIO_PHONE_NUMBER` | Invio OTP via SMS |

### AI
| Variabile | Descrizione |
|---|---|
| `OPENAI_API_KEY` · `OPENAI_API_URL` · `OPENAI_MODEL` | Endpoint OpenAI-compatible |
| `GEMINI_API_KEY` | Google Gemini |
| `GROQ_API_KEY` | Groq |

### Altro
| Variabile | Descrizione |
|---|---|
| `THROTTLE_TTL` · `THROTTLE_LIMIT` | Rate limiting globale |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (anti-bot sui form pubblici) |
| `LIVE_HANDOFF_MAX_PER_DAY` · `LIVE_HANDOFF_TIMEOUT_MINUTES` | Limiti chat live |
| `ANALYTICS_RETENTION_DAYS` | Retention dei dati analytics |
| `REDIS_URL` | Redis (opzionale) |
| `SENTRY_DSN` | Error tracking |
| `GSC_CLIENT_EMAIL` · `GSC_PRIVATE_KEY` · `GSC_SITE_URL` | Google Search Console API |

---

## 📡 API Reference

Tutte le rotte sono prefissate `/api/v1`. 🔒 = richiede `Authorization: Bearer <token>`.
Documentazione interattiva su `/api/docs` (Swagger).

| Modulo | Prefisso | Endpoint principali |
|---|---|---|
| Auth | `/auth` | `POST /register` · `POST /login` · `POST /otp/request` · `POST /otp/verify` · `POST /refresh` · `POST /logout` · `GET /me` 🔒 |
| Projects | `/projects` | `GET /` · `GET /:slug` · `POST /` 🔒 · `PUT /:id` 🔒 · `DELETE /:id` 🔒 |
| Experiences | `/experiences` | `GET /` · `POST /` 🔒 · `PUT /:id` 🔒 · `DELETE /:id` 🔒 |
| About | `/about` | `GET /` · `PUT /` 🔒 |
| Blog | `/blog` | `GET /posts?page&limit&tag` · `GET /posts/:slug` · `GET|POST|PUT|DELETE /admin/posts` 🔒 |
| Notes | `/notes` | `POST /:articleId` · `GET /:articleId` · `GET /:articleId/stats` · `GET /admin/list` 🔒 · `PATCH /:noteId/approve\|reject\|spam` 🔒 · `DELETE /:noteId` 🔒 |
| Testimonials | `/testimonials` | `GET /` · `GET /featured` · `POST /` · `GET /admin/list` 🔒 · `GET /admin/stats` 🔒 · `PATCH /:id/approve\|reject\|spam\|content\|feature` 🔒 · `DELETE /:id` 🔒 |
| Contact | `/contact` | `POST /` · `GET /?page&limit&unreadOnly` 🔒 |
| Search | `/search` | `GET /` · `GET /suggest` |
| Chatbot | `/chatbot` | `POST /message` · `GET /session/:sessionId` · `POST /send-transcript` · `GET /stats` 🔒 · `GET /sessions/today` 🔒 |
| Live handoff | `/chatbot`, `/admin/live-handoff` | `POST /:sessionId/live-handoff` · `GET /:sessionId/live-handoff/status` · `GET /pending` 🔒 + gateway WebSocket |
| AI | `/ai` | `POST /summarize-file` · `POST /ask-document` · `POST /format-text` · `POST /generate-ppt` · `POST /translate-pdf` |
| PDF Search | `/pdf-search` | `GET /` · `GET /gutenberg/:id` · `GET /proxy` |
| OCR | `/ocr` | `POST /extract` |
| Conversion | `/convert` | `POST /` |
| Analytics | `/analytics` | `POST /track` · `GET /` 🔒 · `GET /export/csv?from&to` 🔒 |
| Stats | `/stats` | `GET /` |
| Consent | `/consent` | `POST /` · `GET /stats` 🔒 · `GET /history` 🔒 |
| Audit | `/audit` | `GET /?limit&resource&actorId` 🔒 (admin) |
| Cron | `/admin/cron` | `POST /trigger-daily-summary` 🔒 |
| System | `/system` | `GET /health` · `GET /version` · `GET /ops` |

---

## 🛡️ Sicurezza

### Backend
- **Password**: bcrypt (12 round), mai in chiaro.
- **Validazione input**: `class-validator` su ogni DTO (password forte, email valida, lunghezze massime).
- **JWT**: access token con scadenza `JWT_EXPIRES_IN` (default e valore configurato: `7d`),
  refresh token `7d`, secret da env.
  > Access e refresh hanno la stessa durata: abbassare `JWT_EXPIRES_IN` (es. `15m`) renderebbe
  > la rotazione dei refresh token effettivamente utile.
- **Refresh token**: salvato hashato (bcrypt) sull'utente, rotazione a ogni uso,
  **rilevamento riuso** con revoca immediata della sessione.
- **OTP**: login/registrazione via email o SMS — scadenza 5 min, max 3 richieste per
  identificativo ogni 10 min, max 5 tentativi di verifica.
- **Ruoli**: `JwtAuthGuard` + `RolesGuard` con decoratore `@Roles` su tutte le rotte admin.
- **Rate limiting**: throttler globale configurabile via `THROTTLE_TTL` / `THROTTLE_LIMIT`.
- **Turnstile**: verifica anti-bot su contatti, testimonianze e note del blog.
- **Audit trail**: ogni scrittura admin tracciata in MongoDB con TTL 90 giorni.
- **Helmet + HSTS**, CORS da env, `LoggingInterceptor` globale, `HttpExceptionFilter` uniforme.
- **Cache-Control**: interceptor per cache pubblica sulle GET pubbliche.

### Frontend
- Token in localStorage; `authInterceptor` con retry su 401 + refresh; `errorInterceptor` globale.
- `AuthGuard` su tutte le rotte `/dashboard`.
- **Logout automatico** dopo 5 minuti di inattività (`inactivity.service.ts`) + sync logout multi-tab.
- **CSP** definita lato host: ogni nuovo dominio esterno (es. `ipwho.is` per il geo-detect)
  va aggiunto esplicitamente, altrimenti la richiesta viene bloccata.

---

## 🧪 Test

```bash
cd backend  && npm test          # Jest — 29 suite
cd frontend && npm test          # Karma/Jasmine — 15 suite
cd frontend && npm run test:e2e  # Playwright
```

> I test che parsano un PDF reale richiedono `--experimental-vm-modules`
> (import dinamico di `pdf-parse`): senza, falliscono per motivi di runtime, non applicativi.

**Regola del progetto**: ogni nuova funzionalità richiede unit test verdi prima di
essere considerata completa — non basta che `tsc`/`build` passino.

---

## ⚙️ CI/CD

`.github/workflows/`:

| Workflow | Trigger | Job |
|---|---|---|
| `ci.yml` | push / PR | `backend` (ci → audit → lint → build → test) · `frontend` (ci → audit → lint → test → build:prod) · `e2e` (Playwright/chromium) · `docker-build` (solo `main`) |
| `sitemap.yml` | push + schedule | Rigenera `sitemap.xml` e `rss.xml` includendo i post del blog |
| `mongo-backup.yml` | schedule | Dump periodico del database |

I segreti Railway / Docker Hub / Mongo vanno configurati in **Settings → Secrets** del repo.

---

## 📐 Design System

### Palette
- **Primary**: `#4f6af5` → `#3b4cea` (blu)
- **Accent**: `#8b5cf6` → `#7c3aed` (viola)
- **Cyan**: `#22d3ee` (accento secondario)
- **Background**: `#0a0e1a` → `#141a2e`
- **Text**: `#f1f5f9` (primary) → `#64748b` (muted)

### Font
- **Headings & Body**: Inter (300–900)
- **Code & Tag**: JetBrains Mono (400–600)

I pattern CSS condivisi sono centralizzati in `frontend/src/styles.scss`.

---

© 2025 Gent Sallaku. All rights reserved.
