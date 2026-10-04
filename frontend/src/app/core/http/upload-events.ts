import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Observable, OperatorFunction, from, map, mergeMap, startWith } from 'rxjs';

/**
 * Stato di una richiesta "carica file → elaborazione AI":
 *  - progress:   upload in corso (percent null se il browser non conosce il totale)
 *  - processing: upload finito, il server sta elaborando (nessun avanzamento reale)
 *  - done:       risposta arrivata
 */
export type UploadEvent<T> =
  | { type: 'progress'; percent: number | null }
  | { type: 'processing' }
  | { type: 'done'; body: T };

const emit = <T>(...events: UploadEvent<T>[]): Observable<UploadEvent<T>> => from(events);

/** HttpEvent (observe: 'events', reportProgress: true) → UploadEvent. */
export function toUploadEvents<T>(): OperatorFunction<HttpEvent<T>, UploadEvent<T>> {
  return (source: Observable<HttpEvent<T>>) =>
    source.pipe(
      mergeMap((event): Observable<UploadEvent<T>> => {
        switch (event.type) {
          case HttpEventType.Sent:
            return emit<T>({ type: 'progress', percent: 0 });
          case HttpEventType.UploadProgress: {
            const percent = event.total ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null;
            return percent === 100
              ? emit<T>({ type: 'progress', percent: 100 }, { type: 'processing' })
              : emit<T>({ type: 'progress', percent });
          }
          case HttpEventType.Response:
            return emit<T>({ type: 'done', body: event.body as T });
          default:
            return emit<T>();
        }
      }),
    );
}

/** Per richieste senza file (es. testo JSON): subito "processing", poi "done". */
export function asUploadEvents<T>(): OperatorFunction<T, UploadEvent<T>> {
  return (source: Observable<T>) =>
    source.pipe(
      map((body): UploadEvent<T> => ({ type: 'done', body })),
      startWith<UploadEvent<T>>({ type: 'processing' }),
    );
}
