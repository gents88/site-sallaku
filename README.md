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

1. **Migrazione Angular** – Convertire in progetto Angular con routing e componenti standalone
2. **Autenticazione Admin** – Login/Signup per dashboard di editing contenuti
3. **Dashboard Admin** – CRUD per modificare progetti, esperienze, descrizioni
4. **Blog/Articoli** – Sezione per articoli tecnici e case study
5. **Download CV** – Pulsante per download curriculum PDF
6. **Form contatto** – Form con validazione e invio email
7. **Analytics** – Integrazione Google Analytics / Plausible
8. **SEO avanzato** – Schema.org markup, Open Graph meta tags
9. **Dark/Light toggle** – Possibilità di switch tema

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