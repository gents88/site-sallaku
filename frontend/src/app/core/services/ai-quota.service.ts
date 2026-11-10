import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { environment } from '@env/environment';
import { SKIP_CACHE_INTERCEPTOR } from '../interceptors/cache.interceptor';
import { SKIP_ERROR_TOAST } from '../interceptors/error.interceptor';

export interface AiQuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  /** ISO UTC: quando i contatori giornalieri ripartono. */
  resetsAt: string;
  /** Budget globale di token esaurito: nessuna richiesta AI passa fino a domani. */
  unavailable: boolean;
}

/**
 * Quanto resta all'utente della quota giornaliera AI. Prima il tetto si
 * scopriva solo con un 429 a metà lavoro; ora i tool lo mostrano prima.
 * Lo stato è best effort: se la richiesta fallisce non si mostra nulla,
 * senza toast, perché non deve mai disturbare l'uso dello strumento.
 */
@Injectable({ providedIn: 'root' })
export class AiQuotaService {
  private readonly http = inject(HttpClient);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _status = signal<AiQuotaStatus | null>(null);
  readonly status = this._status.asReadonly();

  private inflight?: Subscription;

  /** Rilegge lo stato; una lettura ancora in corso viene sostituita da quella nuova. */
  refresh(): void {
    if (!this.isBrowser) return;
    this.inflight?.unsubscribe();
    this.inflight = this.http
      .get<AiQuotaStatus>(`${environment.apiUrl}/ai/quota`, {
        context: new HttpContext().set(SKIP_CACHE_INTERCEPTOR, true).set(SKIP_ERROR_TOAST, true),
      })
      .subscribe({
        next: (s) => this._status.set(s),
        error: () => {},
      });
  }
}
