# 🔗 Guida di Integrazione - Componente Note del Blog

Come integrare il componente `ArticleNotesComponent` nel tuo blog esistente.

---

## 📍 Step 1: Importare il Modulo nelle Feature

Individua il modulo dove utilizzi il componente articolo (es: `BlogModule`, `PostModule`, ecc).

### Esempio: `blog.module.ts` o `article.module.ts`

```typescript
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';

// Importa il modulo delle note
import { ArticleNotesModule } from '@shared/components/article-notes/article-notes.module';

// Il tuo componente articolo
import { ArticleComponent } from './article.component';

@NgModule({
  declarations: [ArticleComponent],
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    ArticleNotesModule,  // ← Aggiungi qui
  ],
})
export class BlogModule {}
```

---

## 📍 Step 2: Usare il Componente nel Template

Nel template del tuo articolo (es: `article.component.html`):

```html
<article class="blog-article">
  <!-- Header dell'articolo -->
  <div class="article-header">
    <h1>{{ post.title }}</h1>
    <p class="article-meta">
      {{ post.publishedAt | date: 'longDate' }}
    </p>
  </div>

  <!-- Contenuto dell'articolo -->
  <div class="article-body">
    <img *ngIf="post.coverImage" [src]="post.coverImage" alt="Cover" class="article-cover" />
    <div class="article-content" [innerHTML]="post.content"></div>
  </div>

  <!-- ⭐ AGGIUNGI IL COMPONENTE NOTE QUI ⭐ -->
  <app-article-notes [articleId]="post._id"></app-article-notes>

  <!-- Eventualmente: suggerimenti di lettura, condivisione, ecc. -->
</article>
```

### Parametri Input

| Parametro | Tipo | Obbligatorio | Descrizione |
|-----------|------|--------------|-------------|
| `articleId` | `string` | ✅ Sì | ObjectId dell'articolo in MongoDB |

---

## 📍 Step 3: Configurare l'Environment

Verifica che `environment.ts` e `environment.prod.ts` abbiano la corretta URL dell'API:

### `frontend/src/environments/environment.ts` (Sviluppo)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',  // Locale
};
```

### `frontend/src/environments/environment.prod.ts` (Produzione)

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.tuodomain.it/api',  // Produzione
};
```

---

## 📍 Step 4: HttpClientModule nell'App

Assicurati che `HttpClientModule` sia importato nel tuo `app.module.ts`:

```typescript
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [
    HttpClientModule,  // ← Essenziale per le API calls
    // ...altri moduli
  ],
})
export class AppModule {}
```

---

## 📍 Step 5: CORS Configuration (Backend)

Assicurati che il backend accetti le richieste dal tuo frontend domain.

Nel `main.ts` del backend:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ Abilita CORS
  app.enableCors({
    origin: [
      'http://localhost:4200',        // Dev
      'https://tuodomain.it',         // Prod
      'https://www.tuodomain.it',     // Prod con www
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(3000);
}
bootstrap();
```

---

## 🎨 Personalizzazione Styling

Il componente usa CSS variables per facilità di customizzazione.

### Override dei colori nel tuo `styles.scss` globale:

```scss
// Override dei colori primari
:root {
  --notes-primary: #2563eb;           // Blu primario
  --notes-primary-hover: #1d4ed8;     // Blu hover
  --notes-primary-light: #dbeafe;     // Blu leggero
  --notes-border: #e5e7eb;            // Bordo grigio
  --notes-bg-light: #f9fafb;          // Background
  --notes-text: #1f2937;              // Testo
  --notes-text-secondary: #6b7280;    // Testo secondario
  --notes-success: #10b981;           // Verde successo
  --notes-error: #ef4444;             // Rosso errore
}

// Tema scuro
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --notes-primary: #60a5fa;
    --notes-text: #f3f4f6;
    --notes-border: #374151;
    --notes-bg-light: #1f2937;
    // ...
  }
}
```

### Customizzare il font:

```scss
.article-notes {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

---

## 🚀 Test Integration

### 1. Test Locale

```bash
# Terminal 1: Backend
cd backend
npm run start:dev

# Terminal 2: Frontend
cd frontend
ng serve

# Accedi a http://localhost:4200/blog/articolo-slug
```

### 2. Verifica con Browser DevTools

```javascript
// Console
const articleId = document.querySelector('app-article-notes').getAttribute('data-article-id');
console.log('Article ID:', articleId);

// Testa manualmente una richiesta
fetch('http://localhost:3000/api/notes/' + articleId)
  .then(res => res.json())
  .then(data => console.log('Notes:', data))
  .catch(err => console.error('Error:', err));
```

### 3. Test Form

1. Apri il browser -> F12 (DevTools)
2. Naviga a un articolo del blog
3. Compila il form delle note:
   - Nome (opzionale)
   - Email (opzionale)
   - Contenuto (obbligatorio, min 3 char)
4. Clicca "Pubblica nota"
5. Verifica il messaggio di successo
6. Ricarica la pagina e verifica che la nota sia visibile

---

## 🔄 Component Lifecycle

### Ciclo di vita del componente:

1. **OnInit**
   - Valida l'input `articleId`
   - Carica le note approvate via `NotesService`

2. **Form Submission**
   - Valida il form (Reactive Forms)
   - Invia POST a `/api/notes/:articleId`
   - Aggiorna la cache locale
   - Mostra messaggio di successo

3. **Component Destroy**
   - Completa i subscription tramite `destroy$` subject
   - Libera la memoria

---

## 📱 Responsive Design

Il componente è fully responsive:

```
Desktop (>= 768px)    Medium (~600px)    Mobile (< 600px)
─────────────────     ───────────────    ──────────────
┌─────────────────┐   ┌──────────────┐   ┌────────────┐
│ Titolo          │   │ Titolo       │   │ Titolo     │
├─────────────────┤   ├──────────────┤   ├────────────┤
│ Form Note   │ │   │ Form Note  │   │ Form Note │
│  - Nome     │ │   │  - Nome    │   │  - Nome   │
│  - Email    │ │   │  - Email   │   │  - Email  │
│  - Content  │ │   │  - Content │   │  - Cont.. │
│ [Pubblica]  │ │   │[Pubblica]  │   │[Pubblica] │
└─────────────────┘   └──────────────┘   └────────────┘
│ Note List       │   │ Note List   │   │ Note List │
└─────────────────┘   └──────────────┘   └────────────┘
```

---

## ⚙️ Configurazione Avanzata

### Modificare il rate limiting

Nel backend `notes.controller.ts`:

```typescript
@Post(':articleId')
@Throttle({ default: { limit: 10, ttl: 60000 } })  // 10 req/min
async createNote(...) { }
```

### Modificare limiti di validazione

Nel frontend `article-notes.component.ts`:

```typescript
private createForm(): FormGroup {
  return this.fb.group({
    name: ['', [Validators.maxLength(150)]],        // Aumenta da 100
    content: ['', [
      Validators.required,
      Validators.minLength(5),                      // Aumenta da 3
      Validators.maxLength(2000)                    // Aumenta da 1000
    ]],
  });
}
```

### Aggiungere notifiche email admin

Nel backend `notes.service.ts`:

```typescript
async createNote(...) {
  const note = await this.noteModel.save(newNote);
  
  // Notifica admin
  this.mailService.sendAdminNotification({
    to: 'admin@tuodomain.it',
    subject: `Nuova nota su articolo: ${article.title}`,
    body: `Nota da ${note.name}: ${note.content}`,
  });
  
  return note;
}
```

---

## 🔐 Security Checklist

- [x] **HTTPS in Produzione**: Assicurati che l'API sia servita via HTTPS
- [x] **CORS Corretto**: Configura CORS solo per i tuoi domain
- [x] **Rate Limiting**: Abilitato per prevenire spam
- [x] **Honeypot**: Campo nascosto per rilevare bot
- [x] **Input Sanitization**: HTML escape su tutti gli input
- [x] **CSRF Protection**: Implementare per form POST (se necessario)
- [x] **Content Security Policy**: Configura CSP headers

---

## 📊 Monitoraggio

### Log delle richieste

```bash
# Visualizza i log del backend
cd backend
npm run start:dev 2>&1 | grep -i note

# Visualizza errori nel browser
# F12 -> Console -> filter "notes"
```

### Metriche utili

```typescript
// Nel NotesService
this.logger.log(`Note created for article ${articleId}`);
this.logger.log(`Spam score: ${spamScore}`);
this.logger.log(`Total notes for article: ${totalNotes}`);
```

---

## ❓ FAQ

### Q: Come faccio a moderare le note?

**A:** Accedi al backend admin e usa gli endpoint:
- `PATCH /notes/:noteId/approve` - Approva
- `PATCH /notes/:noteId/spam` - Segna come spam
- `DELETE /notes/:noteId` - Elimina

### Q: Posso personalizzare i messaggi di errore?

**A:** Sì, nel componente `article-notes.component.ts`, modifica il metodo `getErrorMessage()`.

### Q: Come faccio a disabilitare le note su alcuni articoli?

**A:** Nel template, aggiungi una condizione:
```html
<app-article-notes 
  *ngIf="post.allowComments" 
  [articleId]="post._id">
</app-article-notes>
```

### Q: Posso usare un CAPTCHA al posto del honeypot?

**A:** Sì, integra reCAPTCHA v3:
```typescript
// Nel form
captchaToken: ['', Validators.required]

// Nel controller POST
async createNote(@Body('captchaToken') token: string) {
  const score = await this.recaptchaService.verify(token);
  if (score < 0.5) throw new BadRequestException('Failed verification');
}
```

### Q: Le note sono visibili subito?

**A:** Sì, con un piccolo delay (spam score < 30 = auto-approved). Le note sospette richiedono moderazione admin.

---

## 🎉 Success!

Se vedi il componente nel tuo articolo e riesci a pubblicare una nota, l'integrazione è completa! 🚀

---

**Hai domande? Controlla il [Backend README](./backend/src/notes/README.md) per dettagli tecnici.**
