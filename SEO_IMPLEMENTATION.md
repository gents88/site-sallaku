# SEO Implementation Guide

Guida completa per la gestione dei meta tag SEO e l'indexing del progetto portfolio.

## ✅ Implementato

### 1. **Meta Tag Base** (in `index.html`)
- ✓ Page title dinamico
- ✓ Meta description
- ✓ Meta author
- ✓ Meta theme-color
- ✓ Canonical links (dinamici per pagina)

### 2. **Open Graph Tags** (dinamici via SeoService)
```html
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="og:url" content="...">
<meta property="og:type" content="website|article">
<meta property="og:site_name" content="Gent Sallaku">
<meta property="og:locale" content="it_IT|en_US|sq_AL">
```

### 3. **Twitter Card Tags** (dinamici via SeoService)
```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="...">
<meta name="twitter:description" content="...">
<meta name="twitter:image" content="...">
<meta name="twitter:creator" content="@gentsallaku">
```

### 4. **Hreflang Tags** (per localizzazione)
```html
<link rel="alternate" hreflang="it" href="https://gentsallaku.it/">
<link rel="alternate" hreflang="en" href="https://gentsallaku.it/?lang=en">
<link rel="alternate" hreflang="sq" href="https://gentsallaku.it/?lang=sq">
<link rel="alternate" hreflang="x-default" href="https://gentsallaku.it/">
```

### 5. **JSON-LD Structured Data** (via SeoService.injectJsonLd)
- ✓ Person schema (homepage)
- ✓ Article schema (blog posts)
- ✓ Project schema (projects page)

### 6. **Sitemap Configuration**
- ✓ `sitemap.xml` aggiornato con rotte hash-based
- ✓ Priorità settate correttamente (1.0 homepage → 0.5 contact)
- ✓ `lastmod` aggiornato

### 7. **Angular SEO Providers**
```typescript
// In app.config.ts
provideTitle(),    // Gestiste il dinamico <title>
provideMeta(),     // Gestisce i meta tag dinamici
```

### 8. **Google Analytics 4**
- ✓ Integrato via `SeoService.trackPageViews()`
- ✓ Track page_view su ogni NavigationEnd
- ✓ Custom events con `SeoService.trackEvent()`

---

## 📋 Uso del SeoService nei Componenti

### Pattern Raccomandato

In ogni componente:

```typescript
import { SeoService } from '../../core/services/seo.service';

export class MyComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    // Update SEO tags
    this.seo.update({
      title: 'Page Title', // without "| Gent Sallaku" suffix (auto-added)
      description: 'Page meta description (120-160 chars recommended)',
      url: 'https://gentsallaku.it/#/page-route', // canonical URL
      type: 'website', // or 'article'
      locale: 'it_IT', // default: it_IT
    });

    // For blog posts, add structured data
    if (this.isBlogPost) {
      this.seo.injectJsonLd({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: 'Article Title',
        description: 'Article summary',
        author: {
          '@type': 'Person',
          name: 'Gent Sallaku',
        },
        datePublished: '2026-03-24',
        dateModified: '2026-03-24',
      });
    }
  }
}
```

### Componenti Attualmente Implementati

- ✓ **HomeComponent** (`#/homepage`): Homepage con Person schema
- ✓ **ProjectsListComponent** (`#/projects`): Projects page
- ✓ **BlogListComponent** (`#/blog`): Blog listing
- ✓ **BlogDetailComponent** (`#/blog/:slug`): Blog post detail con Article schema
- ✓ **ServicesComponent** (`#/services`): Services page
- ✓ **ContactComponent** (`#/contact`): Contact form page

---

## 🔍 SEO per Ogni Pagina

### Homepage (`#/homepage`)
```
Title: Gent Sallaku | Senior Front-End & API Developer
Description: Senior Front-End Developer e API Developer. Angular, TypeScript, NestJS, Django...
Schema: Person (con knowsAbout array)
Priority: 1.0
```

### About (`#/about` - caricato via HomeComponent)
```
SEO: Ereditato da HomePage
Nota: Considerare SEO specifico per `/about` se diventa una pagina separata
```

### Tech Stack (`#/tech-stack`)
```
SEO: Ereditato da HomePage
Nota: Considerare di aggiungere schema per "Skills" se necessario
```

### Experience (`#/experience`)
```
SEO: Ereditato da HomePage
Nota: Potenziale per organizationMap o jobPosting schema
```

### Projects (`#/projects`)
```
Title: Portfolio Projects | Gent Sallaku
Description: Scopri i miei progetti: Cesium.js geospatial, Photo Sphere VR, data visualization...
Schema: CollectionPage con Project items
Priority: 0.95
```

### Blog (`#/blog`)
```
Title: Blog | Gent Sallaku
Description: Articoli su Angular, TypeScript, web development, data visualization...
Schema: CollectionPage
Priority: 0.8
Change Frequency: weekly (aggiornato frequentemente)
```

### Blog Post (`#/blog/:slug`)
```
Title: [Article Title] | Blog | Gent Sallaku
Description: [Article summary, 120-160 chars]
Schema: BlogPosting con author, datePublished, dateModified
Priority: 0.6-0.8
Meta: article:published_time, article:modified_time, article:author
```

### Services (`#/services`)
```
Title: Services | Gent Sallaku
Description: Servizi di sviluppo: Angular, TypeScript, API backend, data visualization 3D...
Schema: Service con ServiceArea items
Priority: 0.8
```

### Contact (`#/contact`)
```
Title: Contact | Gent Sallaku
Description: Contattami per proposte di progetto o collaborazioni...
Schema: Organization con contactPoint
Priority: 0.7
```

---

## 🛠 Setup Locale

### 1. Verificare Meta Tag in Devtools

```bash
# Apri il sito
chromedevtools → Elements → <head>

# Cerca:
- <title>
- <meta name="description">
- <meta property="og:*">
- <meta name="twitter:*">
- <link rel="canonical">
- <script type="application/ld+json"> (JSON-LD)
```

### 2. Testare con SEO Tools

**Google Search Console:**
```
1. Aggiungi il sito: https://gentsallaku.it
2. Verifica proprietà (HTML meta tag)
3. Invia sitemap.xml
4. Controlla Coverage (indexing status)
```

**Lighthouse Audit:**
```
Chrome DevTools → Lighthouse → SEO → Run audit
Target score: 90+
```

**Rich Results Test:**
```
https://search.google.com/test/rich-results
Testa JSON-LD structured data
```

**Facebook Sharing Debugger:**
```
https://developers.facebook.com/tools/debug/
Verifica Open Graph rendering
```

**Twitter Card Validator:**
```
https://cards-dev.twitter.com/validator
Verifica Twitter meta tag rendering
```

---

## 📝 Checklist per Aggiungere SEO a Nuova Pagina

- [ ] Import `SeoService` nel componente
- [ ] Iniect `SeoService` nel constructor
- [ ] In `ngOnInit()`, chiama `this.seo.update({...})`
- [ ] Settare `title`, `description`, `url` correttamente
- [ ] Se blog/article: settare `type: 'article'`, `publishedDate`, `updatedDate`
- [ ] Se è structured data rilevante: chiama `this.seo.injectJsonLd({...})`
- [ ] Verifica con Lighthouse SEO audit
- [ ] Aggiungi pagina a `sitemap.xml` con priorità corretta
- [ ] Testa Open Graph con Facebook Debugger
- [ ] Testa Twitter Card con Twitter Validator

---

## 🚀 Deploy & Verification

Dopo il deploy in produzione:

```bash
# 1. Build
npm run deploy:prep

# 2. Upload a FileZilla → httpdocs/

# 3. Test online
curl -I https://gentsallaku.it/

# 4. Verificare meta tag
curl https://gentsallaku.it/ | grep "<meta"

# 5. Inviare sitemap a Google Search Console
# https://search.google.com/u/0/search-console/sitemap

# 6. Eseguire Lighthouse audit
# https://lighthouse-metrics.com → insert gentsallaku.it

# 7. Testare Rich Results
# https://search.google.com/test/rich-results?utm_source=sc
```

---

## 🎯 SEO Best Practices

### Titoli
- Lunghezza: 50-60 caracteres (visibile su SERPs)
- Include keyword principale
- Unico per ogni pagina
- Format: `[Page Title] | Site Name`

### Descrizioni
- Lunghezza: 120-160 caracteres (visibile su SERPs)
- Chiama all'azione se rilevante
- Unica per ogni pagina
- Includi le keyword principali

### URL/Canonical
- Sempre HTTPS
- Include main keywords
- Leggibile (slug, non ID)
- Consistente (no duplicate content)

### Immagini
- `og:image`: 1200x630px (Open Graph standard)
- Compressa (<300KB)
- Alt text descrittivo (per accessibility)
- La stessa per tutte le social cards

### Interna Linking
- Link a altri articoli/progetti correlati
- Anchor text descrittivo (non "click here")
- Struttura logica (hub → spoke)

### Performance (Core Web Vitals)
- LCP (Largest Contentful Paint): < 2.5s
- FID (First Input Delay): < 100ms
- CLS (Cumulative Layout Shift): < 0.1
- Monitora con PageSpeed Insights

---

## ⚠️ Common SEO Issues

### Problema: Meta tag non aggiornati
**Soluzione**: Verifica che `SeoService.update()` sia chiamato in `ngOnInit()` o `ngAfterContentInit()`
```typescript
// NON BUONO (too late)
ngAfterViewInit() { this.seo.update(...); }

// BUONO
ngOnInit() { this.seo.update(...); }
```

### Problema: Canonical link sbagliato
**Soluzione**: Sempre includi il `url` nell'`update()` config
```typescript
this.seo.update({
  // ...
  url: 'https://gentsallaku.it/#/projects', // sempre hash-based
});
```

### Problema: Open Graph image non sincronizzata
**Soluzione**: Verifica il percorso assoluto e che l'immagine esista
```
Image URL: https://gentsallaku.it/assets/og-image.jpg
Verifica: curl https://gentsallaku.it/assets/og-image.jpg
```

### Problema: JSON-LD non validato
**Soluzione**: Testa con Google Rich Results Test
```
https://search.google.com/test/rich-results
Incolla l'URL del sito e verifica gli errori
```

---

## 📊 Analytics & Monitoring

### Monitora su Google Search Console
- Impressioni e Click
- Average position su SERPS
- Coverage (indexing errors)
- Security issues
- Core Web Vitals

### Monitora con Google Analytics 4
- `seo.service.trackPageViews()` già implementato
- Custom events con `seo.service.trackEvent(action, params)`
- Monitorare traffic by page
- Conversion funnel

---

## Riferimenti

- [Google Search Central - SEO](https://developers.google.com/search)
- [JSON-LD Schema.org](https://schema.org)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Card Documentation](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Angular Title & Meta Services](https://angular.io/api/platform-browser/Title)

---

**Ultima revisione**: 24 Marzo 2026
**Status**: ✅ Full Implementation
