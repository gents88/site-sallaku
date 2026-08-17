# ✅ Checklist Configurazione Note del Blog

Seguire questa checklist per verificare che tutto sia configurato correttamente.

---

## 🔧 BACKEND SETUP

### ✓ Files creati
- [ ] `backend/src/notes/schemas/note.schema.ts`
- [ ] `backend/src/notes/services/notes.service.ts`
- [ ] `backend/src/notes/services/spam-detection.service.ts`
- [ ] `backend/src/notes/dto/create-note.dto.ts`
- [ ] `backend/src/notes/dto/note-response.dto.ts`
- [ ] `backend/src/notes/notes.controller.ts`
- [ ] `backend/src/notes/notes.module.ts`
- [ ] `backend/src/notes/notes.controller.spec.ts`
- [ ] `backend/src/notes/services/notes.service.spec.ts`
- [ ] `backend/src/notes/README.md`

### ✓ App Module aggiornato
- [ ] Import `NotesModule` in `app.module.ts`
- [ ] Aggiunto a imports array

### ✓ Dipendenze installate
```bash
# Verifica che siano presenti in backend/package.json
```
- [ ] `@nestjs/mongoose` ^11.0.4
- [ ] `mongoose` ^8.2.0
- [ ] `class-validator` ^0.14.1
- [ ] `class-transformer` ^0.5.1

### ✓ Database MongoDB
- [ ] MongoDB in running
- [ ] `MONGODB_URI` configurata in `.env.dev`
- [ ] Connessione testata: `npm run start:dev`

### ✓ Rate Limiting
- [ ] Throttler abilitato in `app.module.ts`
- [ ] Limite globale configurato: 60 req/min
- [ ] Endpoint `POST /notes` ha limit: 5 req/min
- [ ] Endpoint `GET /notes` ha limit: 100 req/min

### ✓ CORS Configurato
In `main.ts`:
```typescript
app.enableCors({
  origin: ['http://localhost:4200'],
  credentials: true,
});
```
- [ ] CORS abilitato

### ✓ Testing Backend
```bash
npm run test
```
- [ ] Tutti i test passano
- [ ] Coverage >= 80%

### ✓ API Endpoints Testati
```bash
curl -X POST http://localhost:3000/api/notes/:articleId \
  -H "Content-Type: application/json" \
  -d '{"content": "Test", "honeypot": ""}'
```
- [ ] POST /notes/:articleId → 201
- [ ] GET /notes/:articleId → 200
- [ ] GET /notes/:articleId/stats → 200 (with JWT)
- [ ] PATCH /notes/:id/approve → 200 (with JWT)

---

## 🎨 FRONTEND SETUP

### ✓ Files creati
- [ ] `frontend/src/app/shared/services/notes.service.ts`
- [ ] `frontend/src/app/shared/components/article-notes/article-notes.component.ts`
- [ ] `frontend/src/app/shared/components/article-notes/article-notes.component.html`
- [ ] `frontend/src/app/shared/components/article-notes/article-notes.component.scss`
- [ ] `frontend/src/app/shared/components/article-notes/article-notes.module.ts`

### ✓ Module Imports
In `blog.module.ts` o module dove usi ArticleComponent:
```typescript
import { ArticleNotesModule } from '@shared/components/article-notes/article-notes.module';

@NgModule({
  imports: [ArticleNotesModule]
})
```
- [ ] ArticleNotesModule importato

### ✓ HttpClientModule
In `app.module.ts`:
```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule]
})
```
- [ ] HttpClientModule presente

### ✓ Template Integration
Nel file articolo template (es: `article.component.html`):
```html
<app-article-notes [articleId]="post._id"></app-article-notes>
```
- [ ] Componente aggiunto al template
- [ ] articleId input passato correttamente

### ✓ Environment Configuration
File `environment.ts`:
```typescript
export const environment = {
  apiUrl: 'http://localhost:3000/api'
};
```
File `environment.prod.ts`:
```typescript
export const environment = {
  apiUrl: 'https://api.tuodomain.it/api'
};
```
- [ ] `environment.ts` configurato
- [ ] `environment.prod.ts` configurato

### ✓ Dependencies
```bash
npm list @angular/forms @angular/common
```
- [ ] @angular/forms ^21.2.19
- [ ] @angular/common ^21.2.19

### ✓ Testing Frontend
```bash
ng test
```
- [ ] Tutti i test passano
- [ ] Nessun warning di compilazione

### ✓ Build
```bash
ng build
ng build --configuration production
```
- [ ] Build dev senza errori
- [ ] Build prod senza errori
- [ ] Nessun unused import

---

## 🧪 INTEGRATION TESTING

### ✓ Local Dev Environment
```bash
# Terminal 1
cd backend && npm run start:dev

# Terminal 2
cd frontend && ng serve
```
- [ ] Backend running su http://localhost:3000
- [ ] Frontend running su http://localhost:4200

### ✓ Browser Test
1. Apri http://localhost:4200/blog/article-slug
2. Scorri fino al componente "Note dei lettori"
- [ ] Componente visibile
- [ ] Form mostra correttamente
- [ ] CSS applicato correttamente

### ✓ Form Validation Test
- [ ] Nome: max 100 caratteri
- [ ] Email: validazione formato email
- [ ] Contenuto: minimo 3, massimo 1000 caratteri
- [ ] Error messages visibili quando invalido

### ✓ Form Submission Test
1. Compila il form:
   - Nome: "Test User"
   - Email: "test@example.com"
   - Contenuto: "Great article!"
2. Clicca "Pubblica nota"
- [ ] Messaggio successo appare
- [ ] Nota appare subito nella lista
- [ ] Form si resetta

### ✓ Honeypot Test
1. Apri DevTools → Console
2. Esegui:
```javascript
document.querySelector('input[formControlName="honeypot"]').value = "spam";
document.querySelector('form').dispatchEvent(new Event('submit'));
```
- [ ] Honeypot field è hidden
- [ ] Riempiendo honeypot, form dovrebbe rifiutare

### ✓ Error Handling Test
1. Prova a inviare senza email (se email richiesta)
2. Prova con email non valida
3. Prova con contenuto vuoto
- [ ] Errori visualizzati correttamente
- [ ] Pulsanti disabilitati quando form invalido

### ✓ Loading States
1. Apri DevTools → Network
2. Throttle: "Slow 3G"
3. Submetti nota
- [ ] Loading spinner mostrato
- [ ] Pulsante disabled durante invio
- [ ] Loading state risolto correttamente

### ✓ Responsive Design
```bash
# Test su diversi breakpoint
```
- [ ] Desktop (1920px): layout a 2 colonne (form + lista)
- [ ] Tablet (768px): single column
- [ ] Mobile (375px): stacked, full width

### ✓ Dark Mode Test
1. Apri DevTools → Appearance
2. Seleziona dark theme
- [ ] CSS variables cambiano
- [ ] Testo leggibile
- [ ] Contrasto accettabile

---

## 🔐 SECURITY VERIFICATION

### ✓ Input Validation
- [ ] Frontend: lunghezza massima rispettate
- [ ] Backend: DTO validators attivi
- [ ] HTML escaping: contenuto non ha `<script>` visibile

### ✓ XSS Prevention
1. Prova inviare: `<img src=x onerror=alert('xss')>`
- [ ] Content salvato come text (escaped)
- [ ] Script non eseguito

### ✓ Rate Limiting
```bash
# Invia 6 richieste in rapida successione
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/notes/:id \
    -d '{"content":"test","honeypot":""}'
  sleep 0.1
done
```
- [ ] 6a richiesta: 429 Too Many Requests

### ✓ CORS
1. Apri DevTools → Console
2. Esegui fetch da domain diverso
```javascript
fetch('http://localhost:3000/api/notes/:id')
```
- [ ] Richiesta bloccata da CORS (se da domain non autorizzato)
- [ ] Richiesta permessa da localhost

### ✓ Spam Detection
1. Prova inviare content con keywords spam:
   - "viagra"
   - "casino"
   - "click here"
- [ ] Richiesta rifiutata

### ✓ Email Validation
1. Prova inviare email invalida: "not-an-email"
- [ ] Errore: "Email non valida"

---

## 📊 DATABASE VERIFICATION

### ✓ Collection Creata
```bash
mongo
> use portfolio_dev
> db.notes.findOne()
```
- [ ] Collection `notes` esiste
- [ ] Documento ha campi corretti

### ✓ Indexes
```bash
> db.notes.getIndexes()
```
- [ ] Index su `articleId` e `createdAt` presente
- [ ] Index performance accettabile

### ✓ Query Performance
```bash
> db.notes.find({articleId: ObjectId("...")}).explain("executionStats")
```
- [ ] Query eseguita con index (COLLSCAN dovrebbe essere piccolo)
- [ ] Tempo query < 100ms

### ✓ Data Integrity
```bash
> db.notes.findOne({isSpam: true})
> db.notes.findOne({isApproved: false})
```
- [ ] Dati salvati correttamente
- [ ] Flags (isSpam, isApproved) settati correttamente

---

## 🚀 PRODUCTION READY

### ✓ Environment Variables
File `.env.prod`:
```
NODE_ENV=prod
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/portfolio_prod
THROTTLE_LIMIT=60
THROTTLE_TTL=60000
```
- [ ] `.env.prod` configurato
- [ ] Secrets non in git (check .gitignore)

### ✓ Build & Deployment
```bash
# Backend
npm run build
NODE_ENV=prod node dist/main

# Frontend
ng build --configuration production
# Deploy dist/ to CDN
```
- [ ] Backend build senza errori
- [ ] Frontend build senza errori
- [ ] Build size accettabile

### ✓ SSL/HTTPS
- [ ] API servita via HTTPS in prod
- [ ] Frontend servita via HTTPS
- [ ] CORS headers includono HTTPS domain

### ✓ Monitoring
- [ ] Error tracking (Sentry) configurato
- [ ] Logging implementato
- [ ] Metrics raccolte

### ✓ Backup
- [ ] MongoDB backup automatico
- [ ] Recovery plan documentato
- [ ] Test restore procedure

---

## 📱 BROWSER COMPATIBILITY

Test su:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

---

## 📝 DOCUMENTATION

- [ ] README principale letto
- [ ] SETUP.md completato
- [ ] INTEGRATION_GUIDE.md seguita
- [ ] API_EXAMPLES.sh testato
- [ ] ARCHITECTURE.md review
- [ ] This checklist completato

---

## 🎯 Final Verification

### User Flow Test
1. [ ] Utente anonimo può leggere note
2. [ ] Utente anonimo può inviare nota
3. [ ] Nota appare subito nella lista
4. [ ] Admin può loggare
5. [ ] Admin vede statistiche
6. [ ] Admin può approvare/rifiutare note

### Performance Baseline
- [ ] GET /notes/:id: < 100ms
- [ ] POST /notes/:id: < 200ms
- [ ] Frontend load time: < 2s
- [ ] LCP: < 2.5s

### Error Handling
- [ ] Server down: error message intelligibile
- [ ] Network error: retry logic
- [ ] 404 Not Found: messaggio appropriato
- [ ] 500 Server Error: fallback UI

---

## ✨ COMPLETION SIGNOFF

| Item | Status | Completato da | Data |
|------|--------|---------------|------|
| Backend implementazione | ✅ | - | - |
| Frontend implementazione | ✅ | - | - |
| Integration testing | ⬜ | - | - |
| Security review | ⬜ | - | - |
| Documentation | ✅ | - | - |
| Production deployment | ⬜ | - | - |

---

**Quando tutti i checkbox sono ✅, il sistema è pronto per la produzione! 🚀**
