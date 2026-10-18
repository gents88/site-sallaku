import { DOCUMENT, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type NotFoundKind = 'route' | 'blog' | 'project';

/**
 * Segnala al backend i link rotti visti dai visitatori (lista 404 della
 * dashboard). Solo nel browser, una volta per percorso a pagina caricata,
 * senza query string; un errore di rete non deve disturbare il visitatore.
 */
@Injectable({ providedIn: 'root' })
export class NotFoundReporterService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly reported = new Set<string>();

  report(url: string, kind: NotFoundKind): void {
    if (!this.isBrowser) return;
    const path = (url || '/').split(/[?#]/)[0];
    if (!path.startsWith('/') || path.startsWith('/dashboard') || this.reported.has(path)) return;
    this.reported.add(path);
    const referrer = this.document.referrer || undefined;
    this.http.post(`${environment.apiUrl}/analytics/not-found`, { path, kind, referrer }).subscribe({ error: () => undefined });
  }
}
