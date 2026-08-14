# 📝 Setup Funzionalità "Note dei Lettori" (Blog Comments)

Guida completa per integrare il sistema di note del blog nel tuo progetto site-sallaku.

---

## 📦 Cos'è incluso

### Backend (NestJS + MongoDB)
- ✅ **Module**: `NotesModule` con controller, service, repository
- ✅ **Schema Mongoose**: Struttura note con validazioni
- ✅ **DTO**: Validazioni con `class-validator`
- ✅ **Anti-spam**: Sistema honeypot + detectionService
- ✅ **Rate limiting**: 5 richieste per minuto (POST), 100/min (GET)
- ✅ **API Endpoints**:
  - `POST /notes/:articleId` - Creare nota
  - `GET /notes/:articleId` - Recuperare note approvate
  - `GET /notes/:articleId/stats` - Statistiche (admin)
  - `PATCH /notes/:noteId/approve` - Approvare nota (admin)
  - `PATCH /notes/:noteId/reject` - Rifiutare nota (admin)
  - `PATCH /notes/:noteId/spam` - Segnalare spam (admin)
  - `DELETE /notes/:noteId` - Eliminare nota (admin)

### Frontend (Angular 21)
- ✅ **Component**: `ArticleNotesComponent` pronto all'uso
- ✅ **Service**: `NotesService` con metodi CRUD
- ✅ **Reactive Forms**: Validazione lato client
- ✅ **UI/UX**: Styling moderno con tema chiaro/scuro
- ✅ **Features**:
  - Form note con validazioni in tempo reale
  - Honeypot per anti-spam
  - Visualizzazione note ordinate per data
  - Messaggi di successo/errore
  - Loading states
  - Character counter

---

## 🚀 Installazione Backend

### Step 1: I file sono già creati

I seguenti file sono stati creati nel backend:

```
backend/src/notes/
├── schemas/
│   └── note.schema.ts         # Mongoose schema
├── services/
│   ├── notes.service.ts        # Logica principale
│   └── spam-detection.service.ts # Anti-spam
├── dto/
│   ├── create-note.dto.ts      # DTO input
│   └── note-response.dto.ts    # DTO output
├── notes.controller.ts         # Endpoints API
└── notes.module.ts             # Modulo NestJS
```

### Step 2: Aggiungere NotesModule all'app.module.ts

✅ Già fatto! Il file `app.module.ts` è stato aggiornato automaticamente.

### Step 3: Verificare le dipendenze

Assicurati che il tuo `backend/package.json` abbia:

```json
{
  "dependencies": {
    "@nestjs/mongoose": "^11.0.4",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "mongoose": "^8.2.0"
  }
}
```

Se mancano, installale:
```bash
cd backend
npm install
```

### Step 4: Testare l'endpoint

```bash
# Avvia il backend
cd backend
npm run start:dev

# Testa la creazione di una nota
curl -X POST http://localhost:3000/notes/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mario Rossi",
    "email": "mario@example.com",
    "content": "Articolo fantastico, grazie!"
  }'
```

---

## 🎨 Installazione Frontend

### Step 1: I file sono già creati

I seguenti file sono stati creati nel frontend:

```
frontend/src/app/shared/
├── services/
│   └── notes.service.ts        # Servizio API
└── components/
    └── article-notes/
        ├── article-notes.component.ts
        ├── article-notes.component.html
        ├── article-notes.component.scss
        └── article-notes.module.ts
```

### Step 2: Importare il modulo

Nel tuo modulo di feature (es: `blog.module.ts` o dove usi `ArticleComponent`), aggiungi:

```typescript
import { ArticleNotesModule } from '@shared/components/article-notes/article-notes.module';

@NgModule({
  declarations: [ArticleComponent],
  imports: [
    CommonModule,
    ArticleNotesModule, // ← Aggiungi qui
  ],
})
export class BlogModule {}
```

### Step 3: Usare il componente

Nel template dell'articolo (es: `article.component.html`):

```html
<article class="article-content">
  <h1>{{ post.title }}</h1>
  <div [innerHTML]="post.content"></div>
  
  <!-- Aggiungi il componente note qui -->
  <app-article-notes [articleId]="post._id"></app-article-notes>
</article>
```

### Step 4: Configurare l'environment

Assicurati che `environment.ts` abbia:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api', // O il tuo URL backend
};
```

### Step 5: HttpClientModule

Verifica che il tuo `app.module.ts` abbia `HttpClientModule`:

```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule],
})
export class AppModule {}
```

---

## 📊 Struttura Database

### Collection `notes`

```json
{
  "_id": ObjectId("507f1f77bcf86cd799439012"),
  "articleId": ObjectId("507f1f77bcf86cd799439011"),
  "name": "Mario Rossi",
  "email": "mario@example.com",
  "content": "Articolo fantastico, grazie!",
  "isApproved": true,
  "isSpam": false,
  "spamScore": 0,
  "userIp": "192.168.1.1",
  "createdAt": ISODate("2026-08-14T10:30:00.000Z"),
  "updatedAt": ISODate("2026-08-14T10:30:00.000Z")
}
```

### Indexes

Già creati automaticamente:

```
- { articleId: 1, createdAt: -1 }
- { articleId: 1, isApproved: 1, createdAt: -1 }
```

---

## 🔒 Sicurezza

### Anti-Spam Frontend
- ✅ Honeypot field nascosto
- ✅ Validazione form lato client
- ✅ Throttling 5 richieste/min per IP
- ✅ Character limits (1000 max)

### Anti-Spam Backend
- ✅ Honeypot validation
- ✅ Spam score detection (keyword detection, URL patterns)
- ✅ Content sanitization (escape HTML)
- ✅ Email validation
- ✅ Rate limiting middleware
- ✅ Input validation con `class-validator`

### Moderazione
- ✅ Note salvate con `isApproved: true` per default se spam score < 30
- ✅ Note con score 30-50: `isApproved: false` (moderazione)
- ✅ Note con score > 50 o honeypot: rifiutate automaticamente
- ✅ Admin endpoints per approvazione manuale

---

## 🛠 Admin Panel

### Statistiche Note

```typescript
// GET /notes/:articleId/stats (admin only)
{
  "total": 15,
  "approved": 13,
  "pending": 1,
  "spam": 1
}
```

### Gestire le Note

```bash
# Approvare una nota
PATCH /notes/:noteId/approve

# Rifiutare una nota
PATCH /notes/:noteId/reject

# Segnalare spam
PATCH /notes/:noteId/spam

# Eliminare una nota
DELETE /notes/:noteId
```

---

## 📱 API Endpoints Completi

### Pubblici (rate limit: 100 req/min)

```
GET  /notes/:articleId                  - Recuperare note approvate
POST /notes/:articleId                  - Creare nota (limit 5/min)
```

### Admin Only (richiede JWT token)

```
GET  /notes/:articleId/stats            - Statistiche
GET  /notes/:noteId/admin               - Dettagli nota
PATCH /notes/:noteId/approve            - Approvare
PATCH /notes/:noteId/reject             - Rifiutare
PATCH /notes/:noteId/spam               - Spam
DELETE /notes/:noteId                   - Eliminare
```

---

## 🧪 Testing

### Test Backend

```bash
cd backend
npm run test

# Test con coverage
npm run test:cov
```

### Test Frontend

```bash
cd frontend
ng test
```

---

## 📝 Customizzazione

### Cambiare il limite di throttling

In `notes.controller.ts`, modifica `@Throttle`:

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 richieste/min
```

### Cambiare lunghezza massima nota

In `create-note.dto.ts` e `note.schema.ts`:

```typescript
// DTO
@MaxLength(2000) // Aumenta da 1000 a 2000
content: string;

// Schema
@Prop({ maxlength: 2000 })
content: string;
```

### Aggiungere CAPTCHA

Nel `NotesController`, integra reCAPTCHA:

```typescript
// POST /notes/:articleId
async createNote(
  @Body() dto: CreateNoteDto,
  @Body('recaptchaToken') token: string,
) {
  // Valida token reCAPTCHA
  const isValid = await this.recaptchaService.verify(token);
  if (!isValid) throw new BadRequestException('Captcha non valido');
  
  return this.notesService.createNote(articleId, dto, userIp);
}
```

### Personalizzare i messaggi

Nel template HTML: modifica le stringhe di testo

Nel servizio spam: aggiungi/rimuovi keyword

---

## 🐛 Troubleshooting

### Errore: "ArticleNotesComponent not found"

```typescript
// Verifica di avere importato ArticleNotesModule
imports: [ArticleNotesModule]
```

### Errore: "Cannot read property 'apiUrl'"

```typescript
// Verifica environment.ts
export const environment = {
  apiUrl: 'http://localhost:3000/api'
};
```

### Le note non si caricano

```bash
# Verifica che il backend sia in esecuzione
curl http://localhost:3000/notes/507f1f77bcf86cd799439011

# Verifica CORS in main.ts
app.enableCors();
```

### Spam score too high

Modifica `spam-detection.service.ts`:

```typescript
// Abbassa il threshold da 50 a 30
return {
  isSpam: score >= 30, // Prima era 50
  score: Math.min(score, 100),
};
```

---

## 📚 Prossimi Step

### Phase 2: Moderazione Avanzata
- [ ] Creare admin dashboard per moderare note
- [ ] Notifiche email admin quando nuova nota
- [ ] Contatore nota non approvate nel backend

### Phase 3: User Experience
- [ ] Paginazione note
- [ ] Ordinamento (recente/popolare)
- [ ] Risposte alle note (nested comments)

### Phase 4: Analytics
- [ ] Tracking note per articolo
- [ ] Statistiche engagement
- [ ] Heatmap sentiment note

---

## ✅ Checklist Completamento

- [x] Backend modulo creato e integrato
- [x] Frontend componente creato
- [x] Database schema definito
- [x] API endpoints implementati
- [x] Validazioni frontend + backend
- [x] Anti-spam honeypot
- [x] Rate limiting
- [x] Sanitizzazione input
- [x] Styling responsive
- [x] Documentazione

---

## 📞 Support

Se hai problemi:

1. Verifica che MongoDB sia in running
2. Controlla che l'articleId sia un ObjectId valido
3. Verifica CORS configuration nel backend
4. Guarda i logs del browser (Console)
5. Guarda i logs del backend (`npm run start:dev`)

---

**Buon divertimento con il tuo sistema di note! 🚀**
