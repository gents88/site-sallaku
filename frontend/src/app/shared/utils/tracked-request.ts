import { DestroyRef, computed, inject, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { UploadEvent } from '../../core/http/upload-events';

/** Forma degli errori HTTP che i tool leggono (HttpErrorResponse col body di Nest). */
export interface RequestError {
  status?: number;
  message?: string;
  error?: { message?: string | string[] } | null;
}

/**
 * Errori su cui ha senso riprovare con la stessa richiesta: rete assente o
 * timeout (status 0/assente), richiesta scaduta, troppe richieste, errori del
 * server. Un 400/401/403/413/415/422 darebbe di nuovo lo stesso esito.
 */
export function isRetryableError(err: RequestError | null | undefined): boolean {
  if (!err) return false;
  const status = err.status;
  if (status === undefined || status === 0) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export interface TrackedRequestHandlers<T> {
  next: (body: T) => void;
  error: (err: RequestError) => void;
  /** Chiamato quando l'utente annulla: di solito non serve mostrare un errore. */
  cancelled?: () => void;
}

/**
 * Una richiesta AI in corso, annullabile, con stato per il template.
 *
 * Prima i tool del Lab non permettevano di annullare: cambiando pagina la
 * richiesta continuava, e l'utente non vedeva alcun avanzamento durante
 * l'upload di file fino a 20MB. Va creata in un injection context (campo
 * del componente): alla distruzione del componente la richiesta viene
 * annullata in automatico.
 */
export class TrackedRequest {
  /** Percentuale di upload; null = sconosciuta o nessun upload. */
  readonly uploadPercent = signal<number | null>(null);
  /** Upload completato, il server sta elaborando. */
  readonly processing = signal(false);
  readonly active = signal(false);
  readonly uploading = computed(() => this.active() && !this.processing());
  /** Ultimo errore della richiesta (null dopo un nuovo avvio, un annullamento o clearFailure()). */
  readonly failure = signal<RequestError | null>(null);
  /** Il pulsante "Riprova" ha senso: l'ultima richiesta è fallita per un motivo transitorio. */
  readonly canRetry = computed(() => !this.active() && isRetryableError(this.failure()));

  private sub: Subscription | null = null;
  private onCancelled: (() => void) | undefined;

  constructor(destroyRef: DestroyRef = inject(DestroyRef)) {
    destroyRef.onDestroy(() => this.cancel());
  }

  run<T>(events$: Observable<UploadEvent<T>>, handlers: TrackedRequestHandlers<T>): void {
    this.cancel();
    this.failure.set(null);
    this.active.set(true);
    this.processing.set(false);
    this.uploadPercent.set(null);
    this.onCancelled = handlers.cancelled;

    this.sub = events$.subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.uploadPercent.set(event.percent);
        } else if (event.type === 'processing') {
          this.processing.set(true);
        } else {
          this.finish();
          handlers.next(event.body);
        }
      },
      error: (err: RequestError) => {
        this.finish();
        this.failure.set(err ?? {});
        handlers.error(err);
      },
      complete: () => this.finish(),
    });
  }

  /** Dimentica l'ultimo errore: da chiamare quando l'utente cambia file o input, così "Riprova" sparisce. */
  clearFailure(): void {
    this.failure.set(null);
  }

  /** Annulla la richiesta in corso (abort della connessione). Ritorna false se non c'era nulla da annullare. */
  cancel(): boolean {
    if (!this.sub || this.sub.closed) return false;
    const cb = this.onCancelled;
    this.sub.unsubscribe();
    this.finish();
    this.failure.set(null);
    cb?.();
    return true;
  }

  private finish(): void {
    this.sub = null;
    this.onCancelled = undefined;
    this.active.set(false);
    this.processing.set(false);
    this.uploadPercent.set(null);
  }
}
