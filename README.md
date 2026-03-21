# Gent Sallaku – Portfolio

> Senior Front-End Developer | Angular | TypeScript | Data Visualization & 3D Web

## 🎯 Obiettivo

Portfolio professionale personal landing page per contesti enterprise (banking, telco, aerospace).

## ✅ Funzionalità Completate

### 🌍 Multilingua (i18n)
- **3 lingue supportate**: 🇮🇹 Italiano (default), 🇬🇧 English, 🇦🇱 Shqip (Albanese)
- **Language switcher** integrato nella navbar con dropdown elegante
- **Persistenza lingua** tramite `localStorage` (ricorda la scelta dell'utente)
- **Sistema data-i18n** con attributi HTML per traduzione automatica di tutti i testi
- **Supporto titoli con gradient** via `data-i18n-title` per sezioni con `<span class="text-gradient">`

### Sezioni
- **Hero** – Nome, ruolo, tagline, descrizione, CTA (Progetti / Contatti), statistiche animate
- **About** – 3 card (Visione E2E, Performance, Leadership) + code window decorativo
- **Tech Stack** – 4 categorie con barre di competenza animate (Frontend Core, UI Frameworks, Data Viz & 3D, DevOps)
- **Progetti** – 3 project card (3D Geospaziale, Virtual Tour 360°, Dashboard Analytics)
- **Esperienza** – Timeline con 5 esperienze **organizzate per tecnologia/competenza** (senza nomi aziende):
  1. Architettura Angular & 3D Web Enterprise
  2. Piattaforme Digitali & Data Visualization
  3. Consulenza Enterprise & Ecosistema Microsoft
  4. Full-Stack Development & Architetture Software
  5. Fondamenta Software & Metodologie Agile
- **Soft Skills** – 4 card (Leadership, Mentoring, Problem Solving, Comunicazione)
- **Contatti** – Email, LinkedIn, GitHub con hover effects

### Design & UX
- ✅ Dark mode con palette blu/viola enterprise
- ✅ Glassmorphism cards con backdrop-filter
- ✅ Animazioni leggere (fade-in, hover, skill bars, counter)
- ✅ Navbar fissa con scroll smooth e active section tracking
- ✅ Language switcher con dropdown e flag emoji
- ✅ Particle system ambient nel hero
- ✅ Responsive design completo (desktop, tablet, mobile)
- ✅ Reduced motion support per accessibilità

### Tecnologie Utilizzate
- HTML5 semantico
- CSS3 (Custom Properties, Grid, Flexbox, Glassmorphism)
- JavaScript vanilla (ES6+ Classes, Intersection Observer)
- Google Fonts (Inter, JetBrains Mono)
- Font Awesome 6 icons

## 📁 Struttura Progetto

```
index.html              → Pagina principale (entry point)
css/
  ├── style.css          → Stili principali + language switcher
  ├── animations.css     → Animazioni e transizioni
  └── responsive.css     → Media queries e breakpoints
js/
  ├── i18n.js            → Sistema i18n con dizionari IT/EN/SQ
  ├── main.js            → Controller (nav, scroll, lang switcher, cursor)
  ├── animations.js      → Scroll reveal e counter animation
  └── particles.js       → Particle system per hero
README.md               → Documentazione
```

## 🔗 Entry Points

| Path | Descrizione |
|------|-------------|
| `/` o `/index.html` | Landing page completa |
| `#hero` | Sezione hero |
| `#about` | Sezione chi sono |
| `#tech-stack` | Sezione tech stack |
| `#projects` | Sezione progetti |
| `#experience` | Sezione esperienza (per tecnologie) |
| `#skills` | Sezione soft skills |
| `#contact` | Sezione contatti |

## 🌐 Sistema i18n

### Come funziona
1. Ogni elemento traducibile ha un attributo `data-i18n="chiave"`
2. I titoli con gradient span usano `data-i18n-title="chiave"` (genera `chiave.1` + `chiave.2`)
3. Elementi con HTML interno usano `data-i18n-html="true"` 
4. Il file `js/i18n.js` contiene tutti i dizionari e la logica di traduzione
5. La lingua scelta viene salvata in `localStorage('gs-portfolio-lang')`

### Aggiungere una nuova lingua
```javascript
// In js/i18n.js, aggiungere un nuovo oggetto in translations:
translations: {
    // ... lingue esistenti ...
    de: {
        'nav.about': 'Über mich',
        'nav.tech': 'Technologien',
        // ... tutte le chiavi ...
    }
}
// Aggiungere anche il bottone nel dropdown HTML
```

## 🚀 Prossimi Sviluppi Consigliati

1. **Download CV** – Pulsante per download curriculum PDF

---

## 🏗️ Full-Stack Portfolio App (Angular 17 + NestJS)

A complete rewrite of the portfolio as a full-stack web application with admin panel lives in the subdirectories:

```
portfolio-backend/    → NestJS 10 REST API
portfolio-frontend/   → Angular 17 SPA
docker-compose.yml    → One-command startup
```

### Features

| Feature | Details |
|---|---|
| JWT Authentication | Register / Login with bcrypt, role-based guards |
| Admin Dashboard | Full CRUD — Projects, Experiences, About, Blog |
| Blog System | Slug-based posts, publish toggle, tag filtering, SEO |
| Contact Form | Sends email via Nodemailer (SMTP) |
| SEO | Dynamic title/meta, Open Graph, Twitter Cards, JSON-LD |
| Dark / Light Theme | Angular Signals + localStorage persistence |
| Responsive UI | Angular Material 17, mobile-first SCSS |
| Analytics | Google Analytics 4 via `gtag()` on every route change |

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17 (standalone), Angular Material 17, SCSS, Signals, RxJS 7 |
| Backend | NestJS 10, Mongoose, Passport JWT, bcrypt, Nodemailer, Swagger |
| Database | MongoDB 7 |
| Infrastructure | Docker Compose, Nginx (SPA + API reverse proxy) |

### Quick Start — Docker (recommended)

```bash
cp portfolio-backend/.env.example portfolio-backend/.env
# Fill in SMTP credentials and JWT_SECRET in portfolio-backend/.env

docker-compose up --build
```

| Service | URL |
|---|---|
| Angular app | http://localhost:4200 |
| NestJS API | http://localhost:3000/api/v1 |
| Swagger docs | http://localhost:3000/api/docs |

### Quick Start — Local Development

```bash
# Terminal 1 – Backend
cd portfolio-backend
cp .env.example .env   # edit values
npm install
npm run start:dev

# Terminal 2 – Frontend
cd portfolio-frontend
npm install
ng serve               # proxies /api → localhost:3000
```

### Deploy Frontend On Apache/Plesk

The production Angular frontend is already configured to call the Railway API directly via:

`https://portfolio-backend-production-e76d.up.railway.app/api/v1`

This means Apache/Plesk only needs to serve the static Angular build.

```bash
cd portfolio-frontend
npm install
npm run build:prod
```

Upload the contents of `portfolio-frontend/dist/portfolio-frontend/browser/` to the Plesk document root for the site.

Important:
- Keep the generated `.htaccess` file in the document root. It enables Angular SPA routing, so routes like `/admin/login` resolve to `index.html`.
- Remove old frontend files from the Apache document root before uploading the new build, otherwise stale hashed assets can break the app.
- No Apache reverse proxy is required for `/api`; the production frontend already uses the absolute Railway backend URL.

### Environment Variables (`portfolio-backend/.env`)

| Variable | Example | Description |
|---|---|---|
| `PORT` | `3000` | API server port |
| `MONGODB_URI` | `mongodb://localhost:27017/portfolio` | MongoDB connection string |
| `JWT_SECRET` | *(long random string)* | JWT signing secret |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | `you@gmail.com` | SMTP username |
| `SMTP_PASS` | `app-password` | SMTP password |
| `EMAIL_FROM` | `"Portfolio" <you@gmail.com>` | From address |
| `EMAIL_TO` | `you@gmail.com` | Recipient for contact emails |
| `CORS_ORIGIN` | `http://localhost:4200` | Allowed CORS origin |

### API Reference

All routes are prefixed `/api/v1`. Routes marked 🔒 require `Authorization: Bearer <token>`.

**Auth** — `/auth`
- `POST /register` · `POST /login` · `GET /me` 🔒

**Projects** — `/projects`
- `GET /` · `GET /:slug` (public)
- `POST /` · `PUT /:id` · `DELETE /:id` 🔒

**Experiences** — `/experiences`
- `GET /` (public) · `POST /` · `PUT /:id` · `DELETE /:id` 🔒

**About** — `/about`
- `GET /` (public) · `PUT /` 🔒

**Blog** — `/blog`
- `GET /posts` · `GET /posts/:slug` (public, supports `?tag=`)
- `GET /admin/posts` · `POST /admin/posts` · `PUT /admin/posts/:id` · `DELETE /admin/posts/:id` 🔒

**Contact** — `POST /contact` (public)

### Admin Panel

Navigate to **http://localhost:4200/admin/login**. Create your account with `POST /api/v1/auth/register` or visit `/admin/register` in the browser.

## 📐 Design System

### Palette Colori
- **Primary**: `#4f6af5` → `#3b4cea` (blu)
- **Accent**: `#8b5cf6` → `#7c3aed` (viola)
- **Cyan**: `#22d3ee` (accent secondario)
- **Background**: `#0a0e1a` → `#141a2e`
- **Text**: `#f1f5f9` (primary) → `#64748b` (muted)

### Font
- **Headings & Body**: Inter (300–900)
- **Code & Tags**: JetBrains Mono (400–600)

---

© 2025 Gent Sallaku. All rights reserved.