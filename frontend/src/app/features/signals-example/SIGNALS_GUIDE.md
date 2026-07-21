# Guida: Angular Signals (Angular 16+)

I Signals forniscono reattività fine-grained, semplificando la gestione dello stato senza RxJS per casi semplici.

---

## 1. Cos'è un Signal?

Un **Signal** è un contenitore di valore che notifica i suoi subscriber quando cambia.

```typescript
import { signal } from '@angular/core';

// Crea un signal con valore iniziale
const count = signal<number>(0);

// Leggi il valore (è una funzione!)
console.log(count()); // 0

// Modifica il valore
count.set(5);         // count() === 5

// Update con funzione
count.update(v => v + 1); // count() === 6
```

### Differenza da RxJS Observable

| Aspect | Signal | Observable |
|--------|--------|-----------|
| **Lettura** | `signal()` funzione | `.subscribe()` o `| async` pipe |
| **Settaggio** | `.set()` / `.update()` | `.next()` su Subject |
| **Performance** | Fine-grained change detection | Coarser updates |
| **Unsubscribe** | Automatic | Manual (`.unsubscribe()`) |
| **Learning curve** | Semplice | Complesso (concetti RxJS) |

---

## 2. Computed Signals

Un **Computed Signal** è un segnale derivato che reagisce automaticamente ai suoi dipendenti.

```typescript
import { signal, computed } from '@angular/core';

const count = signal(5);
const doubled = computed(() => count() * 2);

console.log(doubled()); // 10

count.set(10);
console.log(doubled()); // 20 (automaticamente recalcolato!)
```

### Perché Computed è Efficiente

- ✅ Recalcola solo quando i dipendenti cambiano
- ✅ Caching automatico dei risultati
- ✅ No subscription leaks
- ✅ Lazy evaluation (calcola solo se usato)

```typescript
// Computed con dipendenze multiple
const firstName = signal('John');
const lastName = signal('Doe');
const fullName = computed(() => `${firstName()} ${lastName()}`);

const greeting = computed(() => `Hello, ${fullName()}!`);

console.log(greeting()); // "Hello, John Doe!"

firstName.set('Jane');
console.log(greeting()); // "Hello, Jane Doe!" (recalcolato)
```

---

## 3. Effects

Un **Effect** esegue codice quando i segnali dipendenti cambiano.

```typescript
import { signal, effect } from '@angular/core';

const count = signal(0);

// Effect che esegue quando count cambia
effect(() => {
  console.log(`Count is now: ${count()}`);
});

count.set(1); // Log: "Count is now: 1"
count.set(2); // Log: "Count is now: 2"
```

### Use Cases per Effect

- ✅ Logging/debugging
- ✅ localStorage/sessionStorage
- ✅ Analytics tracking
- ✅ Sincronizzazione con servizi esterni
- ✅ Auto-save di form

```typescript
// Esempio: Auto-save in localStorage
const formData = signal({ name: '', email: '' });

effect(() => {
  localStorage.setItem('draft', JSON.stringify(formData()));
  console.log('Saved to localStorage');
});

formData.set({ name: 'John', email: 'john@example.com' });
// Log: "Saved to localStorage"
```

---

## 4. Componente di Esempio: Counter

Vedi `counter.component.ts` nel progetto per un esempio completo che dimostra:
- `signal()` per stato
- `computed()` per derivazioni
- `effect()` per side effects
- localStorage integration

### Structure del Componente

```
signals-example/
├── counter.component.ts       (Logica con Signals)
├── counter.component.html     (Template con {{ signal() }})
├── counter.component.scss     (Styling)
└── SIGNALS_GUIDE.md          (Questa guida)
```

### Template Syntax

```html
<!-- Leggi il signal nel template -->
<div>Count: {{ count() }}</div>

<!-- Usa computed nel template -->
<div>Doubled: {{ doubleCount() }}</div>

<!-- Bind a input -->
<input [value]="count()" />

<!-- Event binding -->
<button (click)="increment()">Increment</button>
```

---

## 5. Patterns Comuni

### Pattern 1: Stato Locale Semplice

```typescript
export class MyComponent {
  isOpen = signal(false);

  toggle() {
    this.isOpen.update(v => !v);
  }
}
```

```html
<button (click)="toggle()">{{ isOpen() ? 'Close' : 'Open' }}</button>
<div *ngIf="isOpen()">Content</div>
```

### Pattern 2: Form State

```typescript
export class FormComponent {
  formState = signal({
    name: '',
    email: '',
    message: '',
  });

  updateField(field: string, value: string) {
    this.formState.update(state => ({
      ...state,
      [field]: value,
    }));
  }

  isValid = computed(() => {
    const { name, email, message } = this.formState();
    return name.length > 0 && email.includes('@') && message.length > 0;
  });

  submit() {
    if (this.isValid()) {
      console.log('Submit:', this.formState());
    }
  }
}
```

### Pattern 3: Data Loading with Signals

```typescript
export class DataComponent implements OnInit {
  data = signal<any[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  isLoadingOrEmpty = computed(() => 
    this.loading() || this.data().length === 0
  );

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.error.set(null);

    this.api.getData().subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }
}
```

```html
<div *ngIf="isLoadingOrEmpty()">Loading...</div>
<div *ngIf="error()">Error: {{ error() }}</div>
<ul *ngIf="!loading() && data().length">
  <li *ngFor="let item of data()">{{ item.name }}</li>
</ul>
```

### Pattern 4: List Management

```typescript
export class ListComponent {
  items = signal<Item[]>([]);

  addItem(item: Item) {
    this.items.update(items => [...items, item]);
  }

  removeItem(id: string) {
    this.items.update(items => items.filter(i => i.id !== id));
  }

  updateItem(id: string, updates: Partial<Item>) {
    this.items.update(items =>
      items.map(i => i.id === id ? { ...i, ...updates } : i)
    );
  }

  itemCount = computed(() => this.items().length);
}
```

---

## 6. Signal vs RxJS: Quando Usare Cosa

### Usa Signals quando:
- ✅ Stato locale e semplice (boolean, numero, string)
- ✅ Aggiornamenti sincronizzati
- ✅ Poca complessità reattiva
- ✅ Performance è critica

```typescript
// Buon caso per Signal
const isMenuOpen = signal(false);
const theme = signal<'light' | 'dark'>('light');
```

### Usa RxJS quando:
- ✅ Gestione asincrona (HTTP, WebSocket, timer)
- ✅ Operatori reattivi complessi (switchMap, debounceTime, etc)
- ✅ Stream di eventi continui
- ✅ Integrazione con librerie RxJS-based (HttpClient)

```typescript
// Buon caso per RxJS
this.http.get('/api/data').pipe(
  debounceTime(300),
  switchMap(query => this.search(query)),
).subscribe(results => ...);
```

### Combinazione (Pattern Moderno)

```typescript
export class SearchComponent {
  searchTerm = signal('');
  results = signal<SearchResult[]>([]);

  constructor(private searchService: SearchService) {
    // Effect che combina Signal + RxJS
    effect(() => {
      const term = this.searchTerm();
      if (term.length > 2) {
        this.searchService.search(term).subscribe(
          results => this.results.set(results)
        );
      } else {
        this.results.set([]);
      }
    });
  }

  onSearchChange(term: string) {
    this.searchTerm.set(term);
  }
}
```

---

## 7. Performance Tips

### ✅ DO: Usa `computed()` per derivazioni

```typescript
// ✅ Ottimale: computed() ottimizza change detection
activeCount = computed(() => 
  this.todos().filter(t => !t.completed).length
);
```

```typescript
// ❌ Evita: calcolo nel template
<!-- ❌ Recalcola SEMPRE, anche se niente è cambiato -->
<div>{{ todos().filter(t => !t.completed).length }}</div>
```

### ✅ DO: Destructure i segnali al top level

```typescript
// ✅ Buono
export class MyComponent {
  count = signal(0);
  doubled = computed(() => this.count() * 2);
}
```

```typescript
// ❌ Evita di nidificare
export class MyComponent {
  state = signal({ count: 0 });
  doubled = computed(() => this.state().count * 2);
}
```

### ✅ DO: Usa effect() per side effects

```typescript
// ✅ Uso corretto di effect
effect(() => {
  localStorage.setItem('data', JSON.stringify(this.data()));
});
```

```typescript
// ❌ Non usare ngOnInit per reattività
ngOnInit() {
  // Questo NON reagisce ai cambiamenti!
  localStorage.setItem('data', JSON.stringify(this.data()));
}
```

---

## 8. Migrazione da RxJS

### Prima (RxJS)

```typescript
export class CounterComponent {
  private countSubject = new BehaviorSubject(0);
  count$ = this.countSubject.asObservable();

  increment() {
    this.countSubject.next(this.countSubject.value + 1);
  }
}
```

```html
<div>{{ count$ | async }}</div>
```

### Dopo (Signals)

```typescript
export class CounterComponent {
  count = signal(0);

  increment() {
    this.count.update(v => v + 1);
  }
}
```

```html
<div>{{ count() }}</div>
```

### Vantaggi della Migrazione
- ✅ Sintassi più leggibile
- ✅ No `| async` pipe nel template
- ✅ No memory leaks (automatic cleanup)
- ✅ Better IDE support e type inference

---

## 9. Debugging Signals

```typescript
// Aggiungi logging per capire quando i signal cambiano
const count = signal(0);

effect(() => {
  console.log('Count changed:', count());
});

// In DevTools console, monitorare gli aggiornamenti
count.set(1); // Log: "Count changed: 1"
```

### Monitorare Computed

```typescript
const doubled = computed(() => {
  const result = count() * 2;
  console.log('Computed doubled:', result);
  return result;
});

// Accedi al computed SOLO se necessario
console.log(doubled()); // Log: "Computed doubled: ..."
```

---

## 10. Checklist: Usa Signals nel Tuo Progetto

- [ ] Convertito almeno un componente da BehaviorSubject a Signal
- [ ] Capito la differenza tra `signal()`, `computed()`, e `effect()`
- [ ] Testato il componente di esempio `counter.component.ts`
- [ ] Riconvertito form state in un componente esistente
- [ ] Misurato l'impatto su performance con DevTools
- [ ] Documentato i pattern usati nel tuo progetto

---

## 📚 Risorse

- [Angular Signals RFC](https://angular.io/guide/signals)
- [Signals Deep Dive](https://angular.io/guide/signals#signals-deep-dive)
- [Change Detection with Signals](https://angular.io/guide/change-detection#using-signals)

---

## Quick Reference

```typescript
import { signal, computed, effect } from '@angular/core';

// ── Creare ──
const count = signal(0);

// ── Leggere ──
console.log(count());

// ── Scrivere ──
count.set(5);          // Assegna nuovo valore
count.update(v => v+1); // Aggiorna basato su valore attuale

// ── Computed ──
const doubled = computed(() => count() * 2);

// ── Effect ──
effect(() => {
  console.log(`New value: ${count()}`);
});

// ── Template ──
// {{ signal() }}    - Leggi nel template
// (click)="method()" - Call methods
// [ngIf]="signal()" - Use in directives
```
