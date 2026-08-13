# 🚀 Quick Start: Nuove Funzionalità

Guida veloce per iniziare subito a usare gli upgrade architetturali.

---

## 1️⃣ Global Error Handler (Frontend)

**Già configurato!** Non devi fare nulla.

Quando un errore non gestito occorre:
- ✅ Viene catturato automaticamente
- ✅ Appare un toast rosso
- ✅ Messaggio amichevole per l'utente
- ✅ Stack trace in console (dev only)

---

## 2️⃣ Signals - Come Usare Subito

### Passo 1: Importa Signals nel tuo componente

```typescript
import { signal, computed, effect } from '@angular/core';

export class MyComponent {
  // Stato
  count = signal(0);
  
  // Derivazione
  doubled = computed(() => this.count() * 2);
  
  // Side effect
  constructor() {
    effect(() => {
      console.log('Count:', this.count());
    });
  }
  
  // Metodo
  increment() {
    this.count.update(v => v + 1);
  }
}
```

### Passo 2: Usa nel template

```html
<!-- Leggi signal -->
<div>{{ count() }}</div>

<!-- Usa computed -->
<div>Doubled: {{ doubled() }}</div>

<!-- Event binding -->
<button (click)="increment()">+</button>
```

### Passo 3: Test nel tuo browser

```typescript
// In qualsiasi componente
count = signal(0);

constructor() {
  // Questo esegue quando count cambia
  effect(() => {
    console.log('New count:', this.count());
  });
}
```

**Leggi la guida completa:** `frontend/src/app/features/signals-example/SIGNALS_GUIDE.md`

---

## 3️⃣ PWA - Come Verificare

**Già configurato!**

### Verifica che PWA funziona:

```javascript
// Apri DevTools Console
navigator.serviceWorker.controller !== null
// true = Service Worker attivo!

// Offline test
// DevTools > Network > toggle "Offline"
// App carica ancora da cache!
```

---

## 4️⃣ Paginazione - Come Usare Subito

### Backend: Aggiorna un Endpoint

**Prima (senza paginazione):**
```typescript
@Get('posts')
async findPublished() {
  return this.blogService.findPublished();
}
```

**Dopo (con paginazione):**
```typescript
import { PaginationDto, createPaginatedResponse } from '../common/dto/pagination.dto';
import { CacheInterceptor } from '../common/interceptors/cache.interceptor';

@Get('posts')
@UseInterceptors(CacheInterceptor)
@CacheTTL(2 * 60 * 1000) // Opzionale: personalizza TTL
async findPublished(@Query() paginationDto: PaginationDto) {
  return this.blogService.findPublished(paginationDto);
}
```

**Nel servizio:**
```typescript
async findPublished(paginationDto: PaginationDto) {
  const { page = 1, limit = 10, sort, search } = paginationDto;
  const skip = (page - 1) * limit;
  
  const filter = search ? { $or: [{ title: { $regex: search } }] } : {};
  const sortMap = sort ? this.parseSortString(sort) : { createdAt: -1 };
  
  const [data, total] = await Promise.all([
    this.blogModel.find(filter).sort(sortMap).skip(skip).limit(limit).lean(),
    this.blogModel.countDocuments(filter),
  ]);
  
  return createPaginatedResponse(data, { page, limit }, total);
}
```

### Frontend: Chiama l'API con Paginazione

```typescript
import { PaginationDto } from './path/to/pagination.dto';

export class BlogListComponent implements OnInit {
  posts = signal<BlogPost[]>([]);
  loading = signal(false);
  paginationDto = signal<PaginationDto>({ page: 1, limit: 10 });

  constructor(private api: HttpClient) {}

  ngOnInit() {
    this.loadPosts();
  }

  loadPosts() {
    this.loading.set(true);
    const params = this.paginationDto();
    
    this.api.get<PaginatedResponse<BlogPost>>(
      '/api/v1/blog/posts',
      { params }
    ).subscribe(
      response => {
        this.posts.set(response.data);
        this.loading.set(false);
      }
    );
  }

  nextPage() {
    this.paginationDto.update(p => ({ ...p, page: p.page + 1 }));
    this.loadPosts();
  }

  previousPage() {
    this.paginationDto.update(p => ({ ...p, page: Math.max(1, p.page - 1) }));
    this.loadPosts();
  }
}
```

```html
<div>
  <div *ngIf="loading()">Loading...</div>
  <ul *ngIf="!loading()">
    <li *ngFor="let post of posts()">{{ post.title }}</li>
  </ul>
  
  <button (click)="previousPage()">← Prev</button>
  <span>Page {{ paginationDto().page }}</span>
  <button (click)="nextPage()">Next →</button>
</div>
```

---

## 🧪 Test Veloce - 5 Minuti

### Test 1: Signals (1 min)

```bash
# Avvia frontend
ng serve
# Visita: http://localhost:4200/demo/signals
# Click "Incrementa" - Dovresti vedere numero salire e localStorage aggiornare
```

### Test 2: Error Handler (1 min)

```typescript
// In qualsiasi componente
constructor() {
  setTimeout(() => {
    throw new Error('Test');
  }, 2000);
}
// Aspetta 2s → Toast rosso!
```

### Test 3: PWA Offline (1 min)

```bash
ng build
npx http-server dist/site-sallaku/browser -p 8080

# DevTools > Network > toggle "Offline"
# Refresh → Pagina carica ancora!
```

### Test 4: Paginazione (1 min)

```bash
# Se blog API è implementato
curl "http://localhost:3000/api/v1/blog/posts?page=1&limit=10"
# Risposta con pagination metadata
```

### Test 5: Cache (1 min)

```bash
# Primo accesso (MISS)
time curl "http://localhost:3000/api/v1/blog/posts"
# Response: X-Cache: MISS (200ms)

# Secondo accesso (HIT)
time curl "http://localhost:3000/api/v1/blog/posts"
# Response: X-Cache: HIT (1ms) ← 200x FASTER!
```

---

## 📦 Cosa è Stato Aggiunto

### Frontend
```
✅ global-error.handler.ts      (Global error catching)
✅ counter.component.*          (Signals example)
✅ SIGNALS_GUIDE.md            (Complete signals guide)
✅ app.config.ts               (Updated with ErrorHandler)
```

### Backend
```
✅ cache.interceptor.ts        (Auto caching for GET)
✅ pagination.dto.ts           (Reusable pagination)
✅ http-exception.filter.ts    (Improved error handling)
✅ app.module.ts               (CacheModule + interceptor)
✅ PAGINATION_CACHE_GUIDE.md   (Complete guide)
```

### Documentation
```
✅ ARCHITECTURE_IMPROVEMENTS.md (This document)
✅ TEST_NEW_FEATURES.md        (Comprehensive testing guide)
✅ QUICK_START.md              (This file)
```

---

## 🎯 Prossimi Passi

### Immediate (1-2 hours)
- [ ] Test il componente Signals: `/demo/signals`
- [ ] Verifica PWA offline funziona
- [ ] Leggi `SIGNALS_GUIDE.md`
- [ ] Testa paginazione su un endpoint

### Short Term (1-2 days)
- [ ] Converti un componente a Signals
- [ ] Implementa paginazione su un API
- [ ] Metti in cache un endpoint GET
- [ ] Test error handler in production

### Long Term (1-2 weeks)
- [ ] Migra tutti i forms a Signals
- [ ] Implementa paginazione su tutte le liste
- [ ] Configura Redis cache (opzionale)
- [ ] Aggiungi Sentry error tracking
- [ ] Misura performance improvements

---

## 💡 Tips & Tricks

### Signals: Debugging
```typescript
// Loggare ogni cambio
effect(() => {
  console.log('Value:', mySignal());
});
```

### Cache: Disabilita per Testing
```bash
curl "http://localhost:3000/api/v1/blog/posts?nocache=true"
```

### Performance: Misura
```javascript
performance.mark('start');
// ... codice ...
performance.mark('end');
performance.measure('myTest', 'start', 'end');
console.log(performance.getEntriesByName('myTest')[0].duration);
```

### PWA: Force Update
```javascript
navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
window.location.reload();
```

---

## ❓ FAQ

**D: Devo usare Signals ovunque?**  
A: No. Usa Signals per stato locale semplice. Usa RxJS per async (HTTP, WebSocket).

**D: Il caching rompe i dati fresh?**  
A: No. Usa `?nocache=true` per skip cache. O personalizza TTL con `@CacheTTL()`.

**D: ErrorHandler va in production?**  
A: Sì. Ma nasconde dettagli sensibili. Stack trace solo in dev.

**D: PWA funziona su tutti i browser?**  
A: Sì. Modern browsers (Chrome, Firefox, Safari 11+). IE11 non supportato.

**D: Posso disabilitare la paginazione?**  
A: Sì. Mantieni il vecchio endpoint. O rendi paginazione opzionale nel DTO.

---

## 🔗 Link Utili

- **Angular Signals:** https://angular.io/guide/signals
- **NestJS Caching:** https://docs.nestjs.com/techniques/caching
- **PWA Guide:** https://web.dev/progressive-web-apps/
- **MongoDB Pagination:** https://www.mongodb.com/docs/manual/reference/method/cursor.skip/

---

## 🚨 Problemi Comuni

### "Signals non funzionano nel template"
```typescript
// ✅ CORRETTO
{{ count() }}      // Chiama il signal

// ❌ SBAGLIATO
{{ count }}        // Dimentica le parentesi!
```

### "Cache non funziona"
```bash
# Verifica:
# 1. Solo GET è cacheato
# 2. Controlla X-Cache header
# 3. Vedi logs: [CACHE HIT/MISS]
```

### "Errori non vengono mostrati"
```typescript
// Verifica in app.config.ts
{ provide: ErrorHandler, useClass: GlobalErrorHandler }

// Testa con
throw new Error('Test');
```

---

## 📞 Support

Se qualcosa non funziona:

1. Leggi la guida specifica:
   - Signals: `SIGNALS_GUIDE.md`
   - Paginazione: `PAGINATION_CACHE_GUIDE.md`
   - Testing: `TEST_NEW_FEATURES.md`

2. Controlla i log:
   - Frontend: DevTools Console
   - Backend: `npm run start:dev` output

3. Verifica la checklist in `TEST_NEW_FEATURES.md`

---

**Ready? Inizia ora! 🚀**

1. Visit: http://localhost:4200/demo/signals
2. Test offline: DevTools > Network > Offline
3. Test error: `throw new Error('test')`
4. Test cache: `curl http://localhost:3000/api/v1/blog/posts`

Buona fortuna! 🎉
