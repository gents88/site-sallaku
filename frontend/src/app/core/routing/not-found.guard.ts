import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { NotFoundReporterService } from '../services/not-found-reporter.service';

/**
 * Rotta jolly: segnala il percorso inesistente, così un link rotto (slug
 * cambiato, URL vecchio) compare nella lista 404 della dashboard invece di
 * sparire in silenzio, poi lascia mostrare la pagina "non trovata".
 * Prima rimandava alla home: per Google era un soft 404 (pagina 200 con il
 * contenuto della home); ora Apache risponde 404 e la pagina è noindex.
 */
export const notFoundGuard: CanActivateFn = (_route, state) => {
  inject(NotFoundReporterService).report(state.url, 'route');
  return true;
};
