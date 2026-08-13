# 📚 Documentazione – Site Sallaku

Benvenuto! Qui troverai tutta la documentazione tecnica, guide di deployment, checklist e best practices per il progetto.

---

## 🚀 Iniziare Velocemente

**Primo approccio?** Leggi questi guide nell'ordine:

1. **[Quick Start](./QUICK_START.md)** – Setup iniziale e funzionalità principali (Signals, PWA, Paginazione)
2. **[Deploy Plesk](./guides/deploy-plesk.md)** – Come deployare su Plesk via FileZilla
3. **[Mobile Testing](./guides/mobile-testing.md)** – Test su iOS/Android

---

## 📖 Indice Completo

### 🎯 Guides (Pratiche & How-To)

| Guida | Descrizione |
|-------|-------------|
| **[Deploy Plesk](./guides/deploy-plesk.md)** | Setup server Plesk, FileZilla, backend deployment |
| **[Email Setup](./guides/email-setup.md)** | Configurare invio email (nodemailer, SMTP, Gmail) |
| **[Search Console](./guides/search-console.md)** | Integrazione Google Search Console, sitemap, verifica |
| **[Mobile Testing](./guides/mobile-testing.md)** | Testing su iOS/Android, simulatori, device real |
| **[Testing New Features](./guides/testing-new-features.md)** | Comprehensive testing checklist e best practices |

### 🔍 SEO & Content

| Documento | Descrizione |
|-----------|-------------|
| **[SEO Strategy](./seo/strategy.md)** | Strategia SEO, keywords, content planning |
| **[SEO Implementation](./seo/implementation.md)** | Implementazione tecnica SEO, robots.txt, struttura |

### 📋 Templates & Checklists

| Documento | Descrizione |
|-----------|-------------|
| **[Blog Article Template](./templates/blog-article.md)** | Template per scrivere nuovi articoli |
| **[Weekly Checklist](./checklists/weekly.md)** | Checklist settimanale per maintenance e update |

### 🏗️ Architecture & Improvements

| Documento | Descrizione |
|-----------|-------------|
| **[Architecture Improvements](./architecture/improvements.md)** | Upgrade architetturali (Signals, Error Handler, PWA, Paginazione) |

---

## 📂 Struttura

```
docs/
├── README.md                          ← Sei qui
├── QUICK_START.md                     (Guida rapida)
├── guides/
│   ├── deploy-plesk.md
│   ├── email-setup.md
│   ├── search-console.md
│   ├── mobile-testing.md
│   └── testing-new-features.md
├── seo/
│   ├── strategy.md
│   └── implementation.md
├── templates/
│   └── blog-article.md
├── checklists/
│   └── weekly.md
└── architecture/
    └── improvements.md
```

---

## 🔗 Link Rapidi

### Configurazione
- `.env` - Variabili d'ambiente
- `docker-compose.yml` - Setup Docker locale
- `railway.json` - Configurazione Railway (prod backend)

### Repository
- **Frontend:** `/frontend` – Angular app
- **Backend:** `/backend` – NestJS API
- **Scripts:** `/scripts` – Deploy & utility scripts

### External
- **Hosting:** [gentsallaku.it](https://gentsallaku.it)
- **Backend API:** https://portfolio-backend-production-e76d.up.railway.app/api/v1
- **Search Console:** https://search.google.com/search-console

---

## ❓ Domande Frequenti

**D: Da dove inizio?**  
A: Leggi [QUICK_START.md](./QUICK_START.md) per panoramica tecnica, poi specifica il task.

**D: Come si deploysa?**  
A: Dipende dal target:
- **Frontend statico (Plesk):** [Deploy Plesk](./guides/deploy-plesk.md)
- **Backend (Railway):** Push a `main` branch

**D: Dove controllo i log?**  
A: 
- Frontend: DevTools Console
- Backend: Railway dashboard o `npm run start:dev`

**D: Come faccio test su mobile?**  
A: [Mobile Testing Guide](./guides/mobile-testing.md)

**D: Devo testare prima di mergare?**  
A: Sì! Vedi [Testing New Features](./guides/testing-new-features.md)

---

## 📞 Contatti & Support

Se qualcosa non è chiaro:
1. Cerca nella documentazione (Ctrl+F)
2. Leggi la guida correlata
3. Controlla i log del browser/server
4. Se persiste, apri un issue su GitHub

---

## 🎯 Maintenance Checklist

Ricordate di:
- ✅ Leggere [Weekly Checklist](./checklists/weekly.md) ogni lunedì
- ✅ Testare le nuove funzionalità prima di mergare (vedi [Testing Guide](./guides/testing-new-features.md))
- ✅ Aggiornare questa documentazione se aggiungete features nuove
- ✅ Controllare i log di produzione regolarmente

---

**Last updated:** 2026-08-13  
**Maintainer:** Gent Sallaku (gentsallaku@gmail.com)
