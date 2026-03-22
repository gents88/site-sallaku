/**
 * Seed script – Italian blog articles (batch 2).
 *
 * Slugs:
 *   angular-router-security-guards-interceptors
 *   web-accessibility-inclusive-development
 *
 * Usage (from portfolio-backend/):
 *   node <compiled-output>.js
 *
 * Upserts by slug → safe to run multiple times.
 * Reads MONGODB_URI from .env or falls back to localhost.
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// ─── Schema (mirrors post.schema.ts) ────────────────────────────────────────
const PostSchema = new mongoose.Schema(
  {
    title:           { type: String, required: true, trim: true },
    subtitle:        { type: String, default: '' },
    slug:            { type: String, unique: true },
    content:         { type: String, required: true },
    excerpt:         { type: String, default: '' },
    language:        { type: String, enum: ['it', 'en', 'sq'], default: 'it' },
    coverImage:      { type: String, default: '' },
    tags:            { type: [String], default: [] },
    published:       { type: Boolean, default: false },
    publishedAt:     { type: Date,    default: null },
    metaTitle:       { type: String,  default: '' },
    metaDescription: { type: String,  default: '' },
  },
  { timestamps: true, collection: 'posts' },
);

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE 1 – Angular Router Security: Guards & Interceptors
// ═══════════════════════════════════════════════════════════════════════════
const art1 = `
<h2>Introduzione: La Sicurezza è un Requisito, Non un'Opzione</h2>
<p>
  Le applicazioni Angular moderne gestiscono dati sensibili: profili utente, cruscotti aziendali,
  pannelli di amministrazione. Lasciare queste sezioni prive di protezione espone l'applicazione
  a accessi non autorizzati, furto di token e violazioni della privacy. Angular fornisce un
  sistema di sicurezza del routing integrato e componibile: i <strong>Route Guards</strong> e gli
  <strong>HTTP Interceptors</strong>.
</p>
<p>
  Questa guida illustra come costruire un sistema di protezione a più livelli usando gli strumenti
  moderni di Angular 17+. Vedremo ogni meccanismo in dettaglio, con esempi di codice reali pronti
  all'uso in produzione.
</p>
<p>
  <strong>Argomenti:</strong> #Angular #Guards #Interceptor #WebDevelopment #FrontendDevelopment
</p>

<h2>Architettura della Sicurezza Lato Frontend</h2>
<p>
  Prima di entrare nel codice, è fondamentale capire come si stratifica la sicurezza in
  un'applicazione Angular:
</p>
<ul>
  <li>
    <strong>Livello 1 – Route Guards:</strong> controllano se l'utente può navigare vers
    una certa rotta prima ancora che il componente venga creato.
  </li>
  <li>
    <strong>Livello 2 – HTTP Interceptors:</strong> aggiungono token di autenticazione
    a ogni richiesta in uscita e gestiscono le risposte di errore (401, 403) globalmente.
  </li>
  <li>
    <strong>Livello 3 – Backend Validation:</strong> il backend deve <em>sempre</em> rivalidare
    autenticazione e autorizzazione. La sicurezza frontend è una difesa aggiuntiva, non l'unica.
  </li>
</ul>

<h2>Sezione 1: CanActivate — Proteggere le Rotte</h2>
<p>
  <code>CanActivate</code> è il guard più comune. Viene eseguito prima che Angular attivi una rotta
  e il suo componente associato. Se restituisce <code>false</code> o un <code>UrlTree</code>, la
  navigazione viene bloccata e l'utente viene reindirizzato.
</p>
<p>
  Da Angular 15 in poi, l'approccio raccomandato è la <strong>guard function</strong>
  (<code>CanActivateFn</code>) con <code>inject()</code> invece delle classi con interfacce
  deprecate. Questo elimina il boilerplate e sfrutta pienamente la dependency injection funzionale.
</p>

<h3>Guard di Autenticazione Base</h3>
<pre><code class="language-typescript">// core/guards/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  // Preserva l'URL richiesto per redirigere dopo il login
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};
</code></pre>

<h3>Guard per il Ruolo Admin</h3>
<pre><code class="language-typescript">// core/guards/admin.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Non autenticato → vai al login
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  // Autenticato ma non admin → pagina 403
  if (!auth.hasRole('admin')) {
    return router.createUrlTree(['/403']);
  }

  return true;
};
</code></pre>

<h3>AuthService con JWT e Signals</h3>
<p>
  L'<code>AuthService</code> legge il token JWT da <code>localStorage</code>, lo verifica
  lato client e ne espone il contenuto decodificato tramite Angular Signals.
</p>
<pre><code class="language-typescript">// core/services/auth.service.ts
import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

interface TokenPayload {
  sub:   string;
  email: string;
  role:  'admin' | 'user';
  iat:   number;
  exp:   number;
}

function decodeJwt(token: string): TokenPayload | null {
  try {
    const base64Payload = token.split('.')[1];
    const decoded = atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as TokenPayload;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly TOKEN_KEY = 'portfolio_token';

  private readonly _payload = signal&lt;TokenPayload | null&gt;(
    this.readStoredPayload(),
  );

  /** Payload decodificato del JWT corrente (null se non autenticato) */
  readonly currentUser = this._payload.asReadonly();

  /** true se l'utente è admin */
  readonly isAdmin = computed(() => this._payload()?.role === 'admin');

  constructor(private http: HttpClient, private router: Router) {}

  // ── Autenticazione ──────────────────────────────────────────────────────

  login(email: string, password: string) {
    return this.http
      .post&lt;{ access_token: string }&gt;('/api/auth/login', { email, password })
      .pipe(
        tap(({ access_token }) => {
          localStorage.setItem(AuthService.TOKEN_KEY, access_token);
          this._payload.set(decodeJwt(access_token));
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(AuthService.TOKEN_KEY);
    this._payload.set(null);
    this.router.navigate(['/login']);
  }

  // ── Utilità ─────────────────────────────────────────────────────────────

  getToken(): string | null {
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    const payload = decodeJwt(token);
    if (!payload) return false;
    // Verifica scadenza con 30 secondi di tolleranza
    return payload.exp > Date.now() / 1000 + 30;
  }

  hasRole(role: string): boolean {
    return this._payload()?.role === role;
  }

  private readStoredPayload(): TokenPayload | null {
    const token = localStorage.getItem(AuthService.TOKEN_KEY);
    return token ? decodeJwt(token) : null;
  }
}
</code></pre>

<h2>Sezione 2: CanMatch — Sicurezza per i Moduli Lazy-Loaded</h2>
<p>
  Con i moduli lazy-loaded, Angular scarica il bundle JavaScript del modulo solo quando l'utente
  naviga verso quella rotta. Se non si protegge il caricamento, un utente non autorizzato può
  comunque scaricare il codice della dashboard admin semplicemente modificando l'URL,
  anche se non può vederla visivamente.
</p>
<p>
  <code>CanMatch</code> risolve questo problema: se restituisce <code>false</code>, Angular non
  valuta la rotta e non scarica mai il bundle associato.
</p>
<pre><code class="language-typescript">// core/guards/can-match-admin.guard.ts
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const canMatchAdmin: CanMatchFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() && auth.hasRole('admin')) {
    return true;
  }

  // Blocca il download del bundle e reindirizza
  return router.createUrlTree(['/login']);
};
</code></pre>

<h3>Configurazione delle Rotte con CanActivate + CanMatch</h3>
<p>
  Combinare entrambi i guard garantisce la massima sicurezza: <code>CanMatch</code> impedisce il
  download del codice, <code>CanActivate</code> protegge ogni singola subrotta a runtime.
</p>
<pre><code class="language-typescript">// app.routes.ts
import { Routes } from '@angular/router';
import { authGuard }      from './core/guards/auth.guard';
import { adminGuard }     from './core/guards/admin.guard';
import { canMatchAdmin }  from './core/guards/can-match-admin.guard';

export const APP_ROUTES: Routes = [
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
    canActivate: [adminGuard],   // protezione a runtime per ogni subrotta
    canMatch:    [canMatchAdmin], // impedisce il download del bundle
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component')
        .then(c => c.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path:      'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(c => c.LoginComponent),
  },
  { path: '',   redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
</code></pre>

<h2>Sezione 3: CanDeactivate — Proteggere i Form Non Salvati</h2>
<p>
  Uno scenario frequente: l'utente sta compilando un lungo form (profilo, articolo, impostazioni)
  e per errore clicca su un link di navigazione. Senza <code>CanDeactivate</code>, tutte le
  modifiche vengono perse silenziosamente. Con questo guard, appare una richiesta di conferma.
</p>

<h3>Interfaccia Condivisa</h3>
<pre><code class="language-typescript">// core/interfaces/dirty-form.interface.ts
export interface DirtyFormComponent {
  /** Restituisce true se ci sono modifiche non salvate */
  isDirty(): boolean;
}
</code></pre>

<h3>Guard CanDeactivate Generico e Riutilizzabile</h3>
<pre><code class="language-typescript">// core/guards/dirty-form.guard.ts
import { CanDeactivateFn } from '@angular/router';
import { DirtyFormComponent } from '../interfaces/dirty-form.interface';

export const dirtyFormGuard: CanDeactivateFn&lt;DirtyFormComponent&gt; = component => {
  if (!component.isDirty()) {
    return true;
  }

  return window.confirm(
    'Hai modifiche non salvate che andranno perse. Continuare?',
  );
};
</code></pre>

<h3>Componente con Form Reattivo</h3>
<pre><code class="language-typescript">// features/profile/profile-edit.component.ts
import { Component, OnInit } from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DirtyFormComponent } from '../../core/interfaces/dirty-form.interface';

@Component({
  selector:    'app-profile-edit',
  standalone:  true,
  imports:     [ReactiveFormsModule],
  templateUrl: './profile-edit.component.html',
})
export class ProfileEditComponent implements OnInit, DirtyFormComponent {
  readonly form = this.fb.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    bio:         ['', Validators.maxLength(500)],
    website:     ['', Validators.pattern(/^https?:\/\/.+/)],
  });

  private savedSnapshot = '';

  constructor(private fb: NonNullableFormBuilder) {}

  ngOnInit(): void {
    // Carica dati utente dall'API e salva snapshot iniziale
    this.savedSnapshot = JSON.stringify(this.form.getRawValue());
  }

  save(): void {
    if (this.form.invalid) return;
    // Chiamata API...
    this.savedSnapshot = JSON.stringify(this.form.getRawValue());
  }

  isDirty(): boolean {
    return JSON.stringify(this.form.getRawValue()) !== this.savedSnapshot;
  }
}
</code></pre>

<h3>Rotta con CanDeactivate</h3>
<pre><code class="language-typescript">// features/profile/profile.routes.ts
import { Routes } from '@angular/router';
import { dirtyFormGuard } from '../../core/guards/dirty-form.guard';

export const PROFILE_ROUTES: Routes = [
  {
    path: 'edit',
    loadComponent: () =>
      import('./profile-edit.component').then(c => c.ProfileEditComponent),
    canDeactivate: [dirtyFormGuard],
  },
];
</code></pre>

<h2>Sezione 4: HTTP Interceptors — Sicurezza Trasversale</h2>
<p>
  Gli HTTP Interceptors intercettano ogni richiesta HTTP in uscita e ogni risposta in arrivo.
  Sono il luogo ideale per aggiungere il token JWT, gestire i refresh automatici e centralizzare
  la logica di gestione degli errori.
</p>

<h3>Interceptor di Autenticazione JWT</h3>
<pre><code class="language-typescript">// core/interceptors/auth.interceptor.ts
import {
  HttpInterceptorFn,
  HttpErrorResponse,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router }      from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest&lt;unknown&gt;,
  next: HttpHandlerFn,
) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const token  = auth.getToken();

  const authorizedReq = token
    ? req.clone({ setHeaders: { Authorization: \`Bearer \${token}\` } })
    : req;

  return next(authorizedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      switch (err.status) {
        case 401:
          // Token scaduto o non valido
          auth.logout();
          router.navigate(['/login'], {
            queryParams: { reason: 'session-expired' },
          });
          break;
        case 403:
          // Autenticato ma non autorizzato per questa risorsa
          router.navigate(['/403']);
          break;
      }
      return throwError(() => err);
    }),
  );
};
</code></pre>

<h3>Interceptor per Spinner di Caricamento Globale</h3>
<pre><code class="language-typescript">// core/interceptors/loading.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoadingService } from '../services/loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  // Salta le richieste di background (polling, heartbeat)
  if (req.headers.has('X-Background-Request')) {
    return next(req);
  }

  const loading = inject(LoadingService);
  loading.increment();

  return next(req).pipe(
    finalize(() => loading.decrement()),
  );
};
</code></pre>

<h3>LoadingService con Contatore</h3>
<pre><code class="language-typescript">// core/services/loading.service.ts
import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _count = signal(0);

  /** true se c'è almeno una richiesta HTTP in corso */
  readonly isLoading = computed(() => this._count() > 0);

  increment(): void { this._count.update(n => n + 1); }
  decrement(): void { this._count.update(n => Math.max(0, n - 1)); }
}
</code></pre>

<h3>Registrazione in app.config.ts</h3>
<pre><code class="language-typescript">// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  withFetch,
} from '@angular/common/http';
import { APP_ROUTES }         from './app.routes';
import { authInterceptor }    from './core/interceptors/auth.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        loadingInterceptor, // prima: avvia lo spinner
        authInterceptor,    // seconda: aggiunge il token
      ]),
    ),
  ],
};
</code></pre>

<h2>Caso d'Uso Completo: Dashboard Admin Multi-Livello</h2>
<p>
  Vediamo tutto il sistema in azione in un'applicazione di portfolio con pannello admin:
</p>
<pre><code class="language-typescript">// features/admin/admin.routes.ts
import { Routes } from '@angular/router';
import { adminGuard }    from '../../core/guards/admin.guard';
import { dirtyFormGuard } from '../../core/guards/dirty-form.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    // Tutti i figli ereditano il guard, evitando ripetizioni
    canActivate: [adminGuard],
    children: [
      {
        path:          'dashboard',
        loadComponent: () =>
          import('./dashboard/admin-dashboard.component')
            .then(c => c.AdminDashboardComponent),
      },
      {
        path:          'posts',
        loadComponent: () =>
          import('./blog/blog-manage.component')
            .then(c => c.BlogManageComponent),
        canDeactivate: [dirtyFormGuard], // protegge il form dell'editor
      },
      {
        path:          'settings',
        loadComponent: () =>
          import('./settings/settings.component')
            .then(c => c.SettingsComponent),
        canDeactivate: [dirtyFormGuard],
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
];
</code></pre>

<h2>Best Practices per Sicurezza e Performance</h2>
<ul>
  <li>
    <strong>Doppia verifica backend:</strong> i guard proteggono l'UX, ma ogni endpoint API
    deve validare autonomamente il JWT tramite middleware come <code>JwtAuthGuard</code> (NestJS)
    o <code>express-jwt</code>. Non fare mai affidamento solo sul frontend.
  </li>
  <li>
    <strong>Token con scadenza breve:</strong> usa JWT con scadenza di 15-60 minuti combinati
    con refresh token a lunga scadenza. Riduci la finestra di rischio in caso di furto del token.
  </li>
  <li>
    <strong>Non mettere dati sensibili nel JWT:</strong> il payload del JWT è codificato in
    Base64, non cifrato. Includi solo ID, ruolo e scadenza. Mai password, numeri di carta o PII.
  </li>
  <li>
    <strong>Configura CORS correttamente:</strong> il backend deve permettere solo origini
    fidate. Non usare <code>origin: '*'</code> in produzione.
  </li>
  <li>
    <strong>Usa <code>CanMatch</code> per ogni modulo lazy-loaded sensibile:</strong> impedisce
    il download del codice, non solo la visualizzazione. Riduce la superficie di attacco.
  </li>
  <li>
    <strong>Centralizza la gestione degli errori HTTP nell'interceptor:</strong> evita di
    duplicare la logica di redirect al login in ogni service o componente.
  </li>
  <li>
    <strong>Scrivi test per i guard:</strong> testa entrambi i percorsi — autorizzato e
    non autorizzato. I guard sono facilmente testabili con <code>TestBed</code> e mock del
    <code>Router</code>.
  </li>
</ul>

<h2>Conclusione</h2>
<p>
  La sicurezza di un'applicazione Angular si costruisce in strati. I Route Guards
  (<code>CanActivate</code>, <code>CanMatch</code>, <code>CanDeactivate</code>) proteggono
  la navigazione e impediscono il caricamento di codice sensibile. Gli HTTP Interceptors
  garantiscono che ogni comunicazione con il backend avvenga in modo autenticato e gestisca
  correttamente i casi di errore.
</p>
<p>
  Ricorda: la sicurezza frontend è la prima linea di difesa per l'utente, ma la vera sicurezza
  risiede nel backend. Usa entrambi i livelli, testa entrambi, e il tuo sistema sarà robusto
  e professionale.
</p>
<p>
  <strong>#Angular #Guards #Interceptor #WebDevelopment #FrontendDevelopment</strong>
</p>
`.trim();

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE 2 – Web Accessibility & Inclusive Development
// ═══════════════════════════════════════════════════════════════════════════
const art2 = `
<h2>Introduzione: Costruire per Tutti è Costruire Meglio</h2>
<p>
  Nel 2024, il <strong>WebAIM Million Report</strong> ha analizzato le prime un milione di homepage
  web e ha rilevato che il 95,9% presentava errori di accessibilità automaticamente rilevabili.
  Questo dato non è solo una statistica: rappresenta milioni di utenti che ogni giorno si scontrano
  con barriere digitali invisibili ai più.
</p>
<p>
  L'accessibilità web non riguarda solo le persone con disabilità permanenti. Riguarda chiunque si
  trovi in condizioni sfavorevoli: una persona anziana con vista ridotta, un utente con il braccio
  ingessato, qualcuno che usa il telefono in piena luce solare, un professionista che naviga da
  tastiera per produttività. Costruire siti accessibili significa costruire siti migliori per tutti.
</p>
<p>
  In questa guida esamineremo le normative di riferimento, i benefici concreti, le tecniche
  implementative e gli errori da evitare sempre, corredati da esempi di codice reali.
</p>

<h2>Sezione 1: Normative e Inclusività</h2>

<h3>WCAG 2.1 — Lo Standard Internazionale</h3>
<p>
  Le <strong>Web Content Accessibility Guidelines (WCAG) 2.1</strong>, pubblicate dal W3C nel
  giugno 2018, definiscono lo standard globale per l'accessibilità digitale. Si fondano sul
  principio <strong>POUR</strong>:
</p>
<ul>
  <li>
    <strong>Perceivable (Percepibile):</strong> le informazioni devono essere presentabili in forme
    che tutti possano percepire — testo alternativo per immagini, trascrizioni audio, video con
    sottotitoli.
  </li>
  <li>
    <strong>Operable (Utilizzabile):</strong> tutti i componenti interattivi devono funzionare da
    tastiera, avere tempo sufficiente per l'interazione e non causare convulsioni (niente lampeggi
    veloci).
  </li>
  <li>
    <strong>Understandable (Comprensibile):</strong> il testo deve essere leggibile, l'interfaccia
    prevedibile e gli input assistiti da messaggi di errore chiari.
  </li>
  <li>
    <strong>Robust (Robusto):</strong> il contenuto deve funzionare con diverse tecnologie
    assistive — screen reader, display Braille, software di ingrandimento.
  </li>
</ul>

<h4>Livelli di Conformità</h4>
<ul>
  <li><strong>Livello A (minimo):</strong> requisiti essenziali. Senza questi, il sito è inutilizzabile per alcuni utenti.</li>
  <li><strong>Livello AA (raccomandato):</strong> richiesto dalla maggior parte delle normative legali. Target standard per qualsiasi sito professionale.</li>
  <li><strong>Livello AAA (ottimale):</strong> difficile da raggiungere al 100%, ma desiderabile per contenuti specializzati (es. servizi sanitari, educativi).</li>
</ul>

<h3>Normativa Italiana: Legge Stanca e Linee Guida AGID</h3>
<p>
  In Italia, il quadro normativo sull'accessibilità digitale si articola su tre livelli:
</p>
<ul>
  <li>
    <strong>Legge n. 4/2004 (Legge Stanca):</strong> obbliga le Pubbliche Amministrazioni a
    garantire l'accessibilità dei propri siti web e applicazioni. Aggiornata nel 2018 per
    recepire la Direttiva UE 2016/2102.
  </li>
  <li>
    <strong>Direttiva UE 2016/2102:</strong> estende gli obblighi a tutti i siti e app della PA
    degli Stati membri, con scadenze progressive ed eccezioni motivate.
  </li>
  <li>
    <strong>Linee Guida AGID (2020):</strong> definiscono i requisiti tecnici basati su WCAG 2.1 AA
    e obbligano a pubblicare una <em>Dichiarazione di Accessibilità</em> e un meccanismo di
    feedback per segnalare problemi.
  </li>
</ul>
<p>
  Anche i siti privati sono sempre più soggetti a obblighi di accessibilità: la
  <strong>European Accessibility Act (EAA)</strong>, in recepimento entro giugno 2025, estenderà
  i requisiti a e-commerce, banche, trasporti e telecomunicazioni del settore privato.
</p>

<h2>Sezione 2: I Benefici dell'Accessibilità</h2>

<h3>Esperienza Utente Migliorata per Tutti</h3>
<p>
  Ogni pratica di accessibilità migliora l'usabilità in senso ampio. Il principio è noto come
  <strong>"Curb-Cut Effect"</strong> (effetto scivolo per marciapiede): le rampe pensate per le
  sedie a rotelle vengono usate anche da genitori con passeggini, ciclisti, rider con trolley.
  Analogamente:
</p>
<ul>
  <li>I <strong>sottotitoli</strong> aiutano chi è in ambienti rumorosi o studia una lingua straniera.</li>
  <li>Il <strong>contrasto elevato</strong> migliora la leggibilità in piena luce solare.</li>
  <li>La <strong>navigazione da tastiera</strong> velocizza il workflow di utenti power-user.</li>
  <li>I <strong>messaggi di errore chiari</strong> riducono le frustrazioni per chiunque.</li>
</ul>

<h3>Vantaggi SEO Concreti</h3>
<p>
  I motori di ricerca indicizzano i contenuti in modo simile a uno screen reader: non "vedono"
  le immagini, non eseguono JavaScript complesso, si basano su testo e struttura semantica.
</p>
<ul>
  <li><strong>Testo alternativo delle immagini:</strong> indicizzato da Google come contenuto, migliora la ricerca per immagini.</li>
  <li><strong>Gerarchia dei titoli (h1-h6):</strong> comunica la struttura del documento ai crawler, migliorando il ranking per parole chiave.</li>
  <li><strong>Link descrittivi:</strong> "Leggi l'articolo su Angular Guards" è meglio di "Clicca qui" sia per l'utente che per Google.</li>
  <li><strong>Pagine veloci:</strong> un requisito Core Web Vitals (Largest Contentful Paint, Cumulative Layout Shift) che coincide con best practice di accessibilità.</li>
</ul>

<h3>Pubblico Più Ampio e ROI</h3>
<p>
  L'OMS stima che <strong>1,3 miliardi di persone</strong> nel mondo vivano con una qualche forma
  di disabilità. In Italia sono circa 3,1 milioni le persone con limitazioni gravi. A questi si
  aggiungono gli 13,9 milioni di over-65, spesso alle prese con riduzione della vista, difficoltà
  motorie fini o bassa alfabetizzazione digitale.
</p>
<p>
  Rendere un sito accessibile significa aprire le porte a un mercato significativo. Studi di
  settore stimano che i consumatori con disabilità abbiano un potere d'acquisto annuo globale
  superiore a 1.200 miliardi di dollari.
</p>

<h2>Sezione 3: Best Practices Tecniche</h2>

<h3>HTML Semantico — Il Fondamento</h3>
<p>
  La scelta degli elementi HTML giusti è la base di ogni sito accessibile. Gli screen reader
  navigano il DOM e annunciano agli utenti la struttura semantica: "intestazione livello 2",
  "lista di 5 elementi", "pulsante". Questo funziona solo se usi i tag corretti.
</p>
<pre><code class="language-html">&lt;!-- ❌ Struttura non semantica: incomprensibile per gli screen reader --&gt;
&lt;div class="header"&gt;
  &lt;div class="brand" onclick="goHome()"&gt;MySite&lt;/div&gt;
  &lt;div class="menu"&gt;
    &lt;span onclick="goTo('/about')"&gt;About&lt;/span&gt;
    &lt;span onclick="goTo('/blog')"&gt;Blog&lt;/span&gt;
  &lt;/div&gt;
&lt;/div&gt;
&lt;div class="main"&gt;
  &lt;div class="art-title"&gt;Titolo Articolo&lt;/div&gt;
  &lt;div class="art-body"&gt;Contenuto...&lt;/div&gt;
&lt;/div&gt;

&lt;!-- ✅ Struttura semantica: comprensibile, navigabile, indicizzabile --&gt;
&lt;header&gt;
  &lt;a href="/" aria-label="Torna alla homepage di MySite"&gt;MySite&lt;/a&gt;
  &lt;nav aria-label="Navigazione principale"&gt;
    &lt;ul&gt;
      &lt;li&gt;&lt;a href="/about"&gt;About&lt;/a&gt;&lt;/li&gt;
      &lt;li&gt;&lt;a href="/blog"&gt;Blog&lt;/a&gt;&lt;/li&gt;
    &lt;/ul&gt;
  &lt;/nav&gt;
&lt;/header&gt;
&lt;main&gt;
  &lt;article&gt;
    &lt;h1&gt;Titolo Articolo&lt;/h1&gt;
    &lt;p&gt;Contenuto...&lt;/p&gt;
  &lt;/article&gt;
&lt;/main&gt;
</code></pre>

<h3>Attributi ARIA — Arricchire la Semantica Nativa</h3>
<p>
  Quando gli elementi HTML nativi non sono sufficienti (widget complessi, componenti personalizzati),
  gli attributi <strong>ARIA (Accessible Rich Internet Applications)</strong> aggiungono
  informazioni semantiche per le tecnologie assistive.
</p>
<p>
  Regola d'oro: <em>"Nessun ARIA è meglio di ARIA sbagliato."</em> Prima prova con HTML semantico;
  aggiungi ARIA solo se necessario.
</p>
<pre><code class="language-html">&lt;!-- Accordion accessibile con ARIA --&gt;
&lt;div class="accordion"&gt;
  &lt;h3&gt;
    &lt;button
      aria-expanded="false"
      aria-controls="section1-content"
      id="section1-header"
      class="accordion__trigger"
    &gt;
      Cosa significa accessibilità web?
    &lt;/button&gt;
  &lt;/h3&gt;
  &lt;div
    id="section1-content"
    role="region"
    aria-labelledby="section1-header"
    hidden
  &gt;
    &lt;p&gt;
      L'accessibilità web significa che siti web, strumenti e tecnologie
      sono progettati e sviluppati in modo che le persone con disabilità
      possano usarli. Nello specifico, le persone possono percepire,
      comprendere, navigare e interagire con il web.
    &lt;/p&gt;
  &lt;/div&gt;
&lt;/div&gt;

&lt;!-- Tooltip accessibile --&gt;
&lt;button
  aria-describedby="tooltip-save"
  class="btn btn-primary"
&gt;
  Salva
&lt;/button&gt;
&lt;div
  id="tooltip-save"
  role="tooltip"
  class="tooltip"
&gt;
  Salva le modifiche correnti (Ctrl+S)
&lt;/div&gt;

&lt;!-- Live region per notifiche dinamiche --&gt;
&lt;div
  aria-live="polite"
  aria-atomic="true"
  aria-relevant="additions"
  class="visually-hidden"
  id="notifications"
&gt;
  &lt;!-- Aggiornato via JavaScript: verrà annunciato dagli screen reader --&gt;
&lt;/div&gt;
</code></pre>

<h3>Navigazione da Tastiera</h3>
<p>
  Per gli utenti che non possono usare un mouse, la tastiera è l'unico mezzo di navigazione.
  Un sito accessibile deve soddisfare questi requisiti fondamentali:
</p>
<ul>
  <li>Tutti gli elementi interattivi (link, pulsanti, input) devono essere raggiungibili con <code>Tab</code>.</li>
  <li>L'ordine del focus deve essere logico e seguire il flusso visivo della pagina.</li>
  <li>Il focus visibile non deve mai essere rimosso senza un'alternativa chiara.</li>
  <li>Le finestre modali devono intrappolare il focus e ripristinarlo alla chiusura.</li>
  <li>I componenti interattivi complessi (combobox, datepicker) devono supportare i tasti freccia.</li>
</ul>
<pre><code class="language-css">/* ❌ Errore classico: rimozione totale del focus */
* {
  outline: none; /* MAI fare questo */
}

/* ✅ Focus visibile e coerente con il design */
:focus-visible {
  outline: 2px solid var(--color-primary, #005fcc);
  outline-offset: 3px;
  border-radius: 4px;
}

/* Nascosto visivamente ma accessibile agli screen reader */
.visually-hidden {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

/* Rispetta la preferenza per ridurre le animazioni */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration:       0.01ms !important;
    animation-iteration-count: 1     !important;
    transition-duration:      0.01ms !important;
    scroll-behavior:          auto   !important;
  }
}
</code></pre>

<h3>Contrasto dei Colori</h3>
<p>
  Il contrasto tra testo e sfondo è uno dei problemi di accessibilità più comuni e più semplici
  da rimediare. Le WCAG 2.1 AA richiedono:
</p>
<ul>
  <li><strong>Testo normale (&lt;18pt o &lt;14pt grassetto):</strong> rapporto minimo <strong>4.5:1</strong>.</li>
  <li><strong>Testo grande (≥18pt o ≥14pt grassetto):</strong> rapporto minimo <strong>3:1</strong>.</li>
  <li><strong>Elementi UI e grafica informativa:</strong> rapporto minimo <strong>3:1</strong> rispetto ai colori adiacenti.</li>
</ul>
<pre><code class="language-css">/* Esempio di palette con contrasto verificato */
:root {
  /* Testo scuro su sfondo chiaro → rapporto 12.5:1 ✅ */
  --color-text-primary: #1a1a2e;
  --color-bg-primary: #ffffff;

  /* Testo muted ma ancora leggibile → rapporto 4.8:1 ✅ */
  --color-text-muted: #595979;
  --color-bg-primary: #ffffff;

  /* Link su sfondo bianco → rapporto 5.9:1 ✅ */
  --color-link: #0050b3;
  --color-bg-primary: #ffffff;

  /* ❌ Grigio chiarissimo su bianco → rapporto 1.5:1 - non conforme */
  /* --color-text-light: #d4d4d4; su bianco */
}
</code></pre>

<h2>Sezione 4: Esempi Pratici</h2>

<h3>Form di Contatto Completamente Accessibile</h3>
<p>
  Un form accessibile associa ogni input a una label, fornisce suggerimenti contestuali,
  mostra messaggi di errore chiari e usa attributi <code>autocomplete</code> dove appropriato.
</p>
<pre><code class="language-html">&lt;form
  novalidate
  aria-labelledby="contact-form-title"
  aria-describedby="contact-form-desc"
&gt;
  &lt;h2 id="contact-form-title"&gt;Contattami&lt;/h2&gt;
  &lt;p id="contact-form-desc"&gt;
    I campi contrassegnati con
    &lt;abbr title="obbligatorio" aria-label="obbligatorio"&gt;*&lt;/abbr&gt;
    sono obbligatori.
  &lt;/p&gt;

  &lt;!-- Campo Nome --&gt;
  &lt;div class="field"&gt;
    &lt;label for="full-name"&gt;
      Nome e Cognome&lt;span aria-hidden="true"&gt; *&lt;/span&gt;
    &lt;/label&gt;
    &lt;input
      type="text"
      id="full-name"
      name="full-name"
      autocomplete="name"
      required
      aria-required="true"
      aria-describedby="full-name-error"
      placeholder="Es. Mario Rossi"
    /&gt;
    &lt;span
      id="full-name-error"
      role="alert"
      class="field__error"
      hidden
    &gt;
      Il nome è obbligatorio (minimo 2 caratteri).
    &lt;/span&gt;
  &lt;/div&gt;

  &lt;!-- Campo Email --&gt;
  &lt;div class="field"&gt;
    &lt;label for="email-address"&gt;
      Indirizzo Email&lt;span aria-hidden="true"&gt; *&lt;/span&gt;
    &lt;/label&gt;
    &lt;input
      type="email"
      id="email-address"
      name="email"
      autocomplete="email"
      required
      aria-required="true"
      aria-describedby="email-hint email-error"
    /&gt;
    &lt;span id="email-hint" class="field__hint"&gt;
      Formato richiesto: nome@dominio.it
    &lt;/span&gt;
    &lt;span
      id="email-error"
      role="alert"
      class="field__error"
      hidden
    &gt;
      Inserisci un indirizzo email valido.
    &lt;/span&gt;
  &lt;/div&gt;

  &lt;!-- Campo Messaggio --&gt;
  &lt;div class="field"&gt;
    &lt;label for="message"&gt;Messaggio&lt;/label&gt;
    &lt;textarea
      id="message"
      name="message"
      rows="5"
      maxlength="1000"
      aria-describedby="message-counter"
    &gt;&lt;/textarea&gt;
    &lt;span id="message-counter" aria-live="polite" class="field__hint"&gt;
      0 / 1000 caratteri
    &lt;/span&gt;
  &lt;/div&gt;

  &lt;button type="submit"&gt;Invia Messaggio&lt;/button&gt;
&lt;/form&gt;
</code></pre>

<h3>Menu di Navigazione Accessibile con Dropdown</h3>
<pre><code class="language-html">&lt;nav aria-label="Navigazione principale"&gt;
  &lt;ul role="list"&gt;

    &lt;li&gt;&lt;a href="/"&gt;Home&lt;/a&gt;&lt;/li&gt;

    &lt;li class="nav__item--has-dropdown"&gt;
      &lt;button
        type="button"
        aria-haspopup="true"
        aria-expanded="false"
        aria-controls="dropdown-services"
        id="btn-services"
        class="nav__trigger"
      &gt;
        Servizi
        &lt;svg aria-hidden="true" focusable="false"&gt;
          &lt;use href="#icon-chevron-down"&gt;&lt;/use&gt;
        &lt;/svg&gt;
      &lt;/button&gt;

      &lt;ul
        id="dropdown-services"
        role="menu"
        aria-labelledby="btn-services"
        class="nav__dropdown"
        hidden
      &gt;
        &lt;li role="none"&gt;
          &lt;a href="/servizi/web" role="menuitem"&gt;Sviluppo Web&lt;/a&gt;
        &lt;/li&gt;
        &lt;li role="none"&gt;
          &lt;a href="/servizi/mobile" role="menuitem"&gt;App Mobile&lt;/a&gt;
        &lt;/li&gt;
        &lt;li role="none"&gt;
          &lt;a href="/servizi/consulenza" role="menuitem"&gt;Consulenza&lt;/a&gt;
        &lt;/li&gt;
      &lt;/ul&gt;
    &lt;/li&gt;

    &lt;li&gt;&lt;a href="/blog"&gt;Blog&lt;/a&gt;&lt;/li&gt;
    &lt;li&gt;&lt;a href="/contatti"&gt;Contatti&lt;/a&gt;&lt;/li&gt;

  &lt;/ul&gt;
&lt;/nav&gt;
</code></pre>
<pre><code class="language-javascript">// Gestione tastiera per il dropdown
document.querySelectorAll('[aria-haspopup="true"]').forEach(trigger => {
  const dropdownId = trigger.getAttribute('aria-controls');
  const dropdown   = document.getElementById(dropdownId);
  if (!dropdown) return;

  // Apri/chiudi al click
  trigger.addEventListener('click', () => {
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!isOpen));
    dropdown.hidden = isOpen;
    if (!isOpen) {
      // Sposta il focus al primo elemento del menu
      const firstItem = dropdown.querySelector('[role="menuitem"]');
      firstItem?.focus();
    }
  });

  // Chiudi con Escape e riporta il focus al trigger
  dropdown.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      trigger.setAttribute('aria-expanded', 'false');
      dropdown.hidden = true;
      trigger.focus();
    }
  });

  // Chiudi cliccando fuori
  document.addEventListener('click', e => {
    if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
      trigger.setAttribute('aria-expanded', 'false');
      dropdown.hidden = true;
    }
  });
});
</code></pre>

<h2>Sezione 5: Errori Comuni da Evitare</h2>
<ul>
  <li>
    <strong>Attributo <code>alt</code> mancante o vuoto sulle immagini informative:</strong>
    ogni immagine che veicola informazioni deve avere un testo alternativo descrittivo.
    Le immagini puramente decorative usano <code>alt=""</code> (stringa vuota, non assente)
    per essere ignorate dagli screen reader.
  </li>
  <li>
    <strong>Testo generico nei link:</strong> evita "Clicca qui", "Leggi di più", "Scopri".
    Usa testi descrittivi come "Leggi l'articolo su Angular Guards" che abbiano senso
    anche fuori contesto.
  </li>
  <li>
    <strong>Gerarchia dei titoli non lineare:</strong> non saltare livelli di heading
    (es. da <code>h1</code> a <code>h4</code>). La struttura deve essere in sequenza
    per permettere la navigazione rapida con gli screen reader.
  </li>
  <li>
    <strong><code>outline: none</code> senza alternativa:</strong> rimuovere l'outline
    del focus rende impossibile la navigazione da tastiera. Se l'outline predefinito è
    esteticamente sgradevole, personalizzalo con <code>:focus-visible</code>.
  </li>
  <li>
    <strong>Form senza label collegate:</strong> ogni input deve avere un'etichetta
    collegata tramite <code>for</code>/<code>id</code>. Il placeholder non è un sostituto
    della label: scompare alla digitazione e non è compatibile con tutti i screen reader.
  </li>
  <li>
    <strong>Contrasto insufficiente:</strong> testo grigio chiaro su sfondo bianco è il
    problema più diffuso. Verifica sempre con strumenti come WebAIM Contrast Checker o
    l'Accessibility Inspector di Chrome DevTools.
  </li>
  <li>
    <strong>Movimenti automatici senza controllo:</strong> carousel, animazioni in loop e
    video in autoplay devono avere un pulsante di pausa e rispettare
    <code>prefers-reduced-motion</code>.
  </li>
  <li>
    <strong>Tabelle per il layout:</strong> usa le tabelle solo per dati tabulari, con
    intestazioni <code>&lt;th scope="col"&gt;</code> e <code>&lt;th scope="row"&gt;</code>
    per definire le relazioni.
  </li>
  <li>
    <strong>Colore come unico indicatore:</strong> non usare il solo colore per comunicare
    stati (es. campo obbligatorio in rosso). Aggiunge un'icona, un bordo o un testo
    descrittivo.
  </li>
  <li>
    <strong>Modali che non gestiscono il focus:</strong> quando si apre una finestra modale,
    il focus deve spostarsi al suo interno e non uscirne finché non viene chiusa. Alla
    chiusura, il focus torna all'elemento che ha aperto la modale.
  </li>
</ul>

<h2>Conclusione: Il Web che Vogliamo Costruire</h2>
<p>
  L'accessibilità non è una feature da aggiungere alla fine: è una qualità fondamentale,
  come la performance e la sicurezza. Integrarla nel flusso di sviluppo dal primo giorno
  ha un costo marginale molto inferiore rispetto al retrofitting di un sito esistente.
</p>
<p>
  Come sviluppatori professionisti, abbiamo la capacità e la responsabilità di rendere il
  web più equo. Ogni immagine con un buon <code>alt</code>, ogni form con label correttamente
  associate, ogni componente navigabile da tastiera è un passo concreto verso un internet che
  non lascia nessuno indietro.
</p>
<p>
  I benefici sono reali e misurabili: migliore SEO, conformità legale, pubblico più ampio,
  UX superiore per tutti. Ma al di là dei numeri, c'è la soddisfazione di costruire qualcosa
  di genuinamente utile, per il maggior numero di persone possibile.
</p>
<p>
  <strong>Inizia oggi:</strong> installa l'estensione Axe DevTools nel tuo browser,
  esegui un audit sulla tua homepage e risolvi i primi cinque problemi trovati. Il viaggio
  verso un web più accessibile comincia da un singolo commit.
</p>
`.trim();

// ─── Post payloads ────────────────────────────────────────────────────────────
const posts = [
  {
    title:           '🔐 Sicurezza nei Router di Angular: Guards e Interceptor in Azione',
    subtitle:        'Una guida completa a CanActivate, CanMatch, CanDeactivate e HTTP Interceptors per proteggere rotte e gestire JWT in Angular 17+',
    slug:            'angular-router-security-guards-interceptors',
    language:        'it',
    content:         art1,
    excerpt:         'Scopri come proteggere le rotte Angular con guard funzionali (CanActivate, CanMatch, CanDeactivate) e HTTP Interceptors per autenticazione JWT, spinner globale e blocco navigazione non salvata.',
    tags:            ['Angular', 'Guards', 'Interceptor', 'WebDevelopment', 'FrontendDevelopment', 'JWT', 'TypeScript', 'Security'],
    published:       true,
    metaTitle:       'Sicurezza Router Angular: Guards e Interceptor in Azione',
    metaDescription: 'Guida completa a CanActivate, CanMatch, CanDeactivate e HTTP Interceptors in Angular 17+ con esempi pratici JWT, spinner globale e protezione moduli lazy-loaded.',
  },
  {
    title:           "L'Importanza di Creare Siti Web Accessibili: Un Impegno Professionale per un Web Inclusivo",
    subtitle:        'WCAG 2.1, Legge Stanca, AGID, ARIA, navigazione da tastiera e best practices per costruire siti web accessibili a tutti',
    slug:            'web-accessibility-inclusive-development',
    language:        'it',
    content:         art2,
    excerpt:         "Perché l'accessibilità web è un obbligo etico, legale e professionale. Guida pratica con WCAG 2.1, AGID, HTML semantico, attributi ARIA, esempi di form e menu accessibili ed errori comuni da evitare.",
    tags:            ['Accessibilità', 'WCAG', 'WebDevelopment', 'HTML', 'ARIA', 'SEO', 'UX', 'InclusiveDesign', 'CSS'],
    published:       true,
    metaTitle:       "Accessibilità Web: WCAG 2.1, ARIA e Best Practices per un Web Inclusivo",
    metaDescription: "Guida completa all'accessibilità web: WCAG 2.1, AGID, HTML semantico, attributi ARIA, contrasto colori, form accessibile, menu accessibile ed errori comuni.",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/portfolio';
  console.log('Connecting to MongoDB…');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const PostModel = mongoose.model('Post', PostSchema);

  for (const post of posts) {
    const doc = await PostModel.findOneAndUpdate(
      { slug: post.slug },
      { $set: { ...post, publishedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`✔  Upserted: "${doc.title}"\n   slug: ${doc.slug}\n   id:   ${doc._id}\n`);
  }

  await mongoose.disconnect();
  console.log('Done. Disconnected from MongoDB.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
