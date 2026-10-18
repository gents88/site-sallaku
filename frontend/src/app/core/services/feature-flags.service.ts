import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Specchio di backend/src/common/settings/feature-flags.ts. */
export interface FeatureFlags {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  aiEnabled: boolean;
  chatbotEnabled: boolean;
  liveHandoffEnabled: boolean;
  registrationEnabled: boolean;
  newsletterSignupEnabled: boolean;
  contactFormEnabled: boolean;
}

export type BooleanFeatureFlag = Exclude<keyof FeatureFlags, 'maintenanceMessage'>;

/** Ordine dei toggle nella dashboard. */
export const BOOLEAN_FEATURE_FLAGS: readonly BooleanFeatureFlag[] = [
  'maintenanceMode',
  'aiEnabled',
  'chatbotEnabled',
  'liveHandoffEnabled',
  'contactFormEnabled',
  'newsletterSignupEnabled',
  'registrationEnabled',
];

export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  maintenanceMode: false,
  maintenanceMessage: '',
  aiEnabled: true,
  chatbotEnabled: true,
  liveHandoffEnabled: true,
  registrationEnabled: true,
  newsletterSignupEnabled: true,
  contactFormEnabled: true,
});

/** Una risposta parziale o vecchia non deve lasciare buchi: i campi mancanti prendono il default. */
export function normalizeFlags(raw: Partial<FeatureFlags> | null | undefined): FeatureFlags {
  const out = { ...DEFAULT_FEATURE_FLAGS };
  if (!raw) return out;
  for (const key of BOOLEAN_FEATURE_FLAGS) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  if (typeof raw.maintenanceMessage === 'string') out.maintenanceMessage = raw.maintenanceMessage;
  return out;
}

const REFRESH_MS = 5 * 60_000;

/**
 * Interruttori del sito (GET /system/flags). Fino alla risposta valgono i
 * default (tutto acceso): un backend lento o giù non spegne nulla. Mai letti
 * durante il prerender, che non deve "fotografare" una manutenzione.
 */
@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly url = `${environment.apiUrl}/system/flags`;

  private readonly state = signal<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS });
  readonly flags = this.state.asReadonly();
  readonly loaded = signal(false);

  readonly maintenanceMode = computed(() => this.state().maintenanceMode);
  readonly chatbotEnabled = computed(() => this.state().chatbotEnabled);
  readonly liveHandoffEnabled = computed(() => this.state().liveHandoffEnabled);
  readonly newsletterSignupEnabled = computed(() => this.state().newsletterSignupEnabled);
  readonly registrationEnabled = computed(() => this.state().registrationEnabled);
  readonly contactFormEnabled = computed(() => this.state().contactFormEnabled);
  readonly aiEnabled = computed(() => this.state().aiEnabled);

  private lastLoadAt = 0;

  constructor() {
    if (!this.isBrowser) return;
    this.refresh();
    setInterval(() => {
      if (!document.hidden) this.refresh();
    }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - this.lastLoadAt > REFRESH_MS) this.refresh();
    });
  }

  refresh(): void {
    if (!this.isBrowser) return;
    this.lastLoadAt = Date.now();
    this.http.get<Partial<FeatureFlags>>(this.url).subscribe({
      next: (raw) => {
        this.state.set(normalizeFlags(raw));
        this.loaded.set(true);
      },
      // Si tengono i valori correnti: meglio un flag vecchio che uno inventato.
      error: () => undefined,
    });
  }

  /** Admin: la risposta del server diventa subito lo stato locale. */
  update(patch: Partial<FeatureFlags>): Observable<FeatureFlags> {
    return this.http.patch<Partial<FeatureFlags>>(this.url, patch).pipe(
      map(normalizeFlags),
      tap((flags) => {
        this.state.set(flags);
        this.loaded.set(true);
      }),
    );
  }
}
