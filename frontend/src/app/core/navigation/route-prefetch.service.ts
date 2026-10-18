import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Route, Router, Routes } from '@angular/router';
import { isSlowConnection } from '../strategies/selective-preload.strategy';

type LazyLoader = NonNullable<Route['loadComponent']>;

/**
 * Caricatori lazy dei componenti che una navigazione verso `path` dovrebbe
 * scaricare: la pagina e le shell che la contengono (es. /dashboard/blog →
 * AdminShell + BlogManage). Il path è quello logico del registro, senza
 * prefisso lingua: il ramo `:lang` duplica le stesse pagine e viene saltato.
 */
export function lazyLoadersFor(config: Routes, path: string): LazyLoader[] {
  const segments = path.split('/').filter(Boolean);

  const walk = (routes: Routes, rest: string[]): LazyLoader[] | null => {
    for (const route of routes) {
      if (route.path === undefined || route.path === '**' || route.path.startsWith(':lang') || route.redirectTo !== undefined) continue;
      const own = route.path.split('/').filter(Boolean);
      if (own.length > rest.length) continue;
      if (!own.every((segment, i) => segment.startsWith(':') || segment === rest[i])) continue;

      const remaining = rest.slice(own.length);
      const loaders = route.loadComponent ? [route.loadComponent] : [];
      if (remaining.length === 0 && !route.children) return loaders;
      if (route.children) {
        // Senza segmenti residui resta da trovare il figlio di default (path '').
        const inner = walk(route.children, remaining);
        if (inner) return [...loaders, ...inner];
      }
      if (remaining.length === 0) return loaders;
    }
    return null;
  };

  return walk(config, segments) ?? [];
}

/**
 * Scarica in anticipo il codice di una pagina mentre l'utente punta la voce
 * che ci porta: al click la navigazione non aspetta più la rete. Gli
 * strumenti del Lab non sono nel preload del router (troppo pesanti per
 * scaricarli tutti a ogni visita), quindi solo quello che si sta per aprire.
 */
@Injectable({ providedIn: 'root' })
export class RoutePrefetchService {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly requested = new Set<string>();

  prefetch(path: string): void {
    if (!this.isBrowser || this.requested.has(path) || isSlowConnection()) return;
    this.requested.add(path);
    for (const load of lazyLoadersFor(this.router.config, path)) {
      const result = load();
      // import() già risolto resta in cache nel browser: il router, al click, lo ritrova subito.
      // Su errore di rete si riproverà al prossimo passaggio (o al click, normalmente).
      if (result instanceof Promise) result.catch(() => this.requested.delete(path));
    }
  }
}
