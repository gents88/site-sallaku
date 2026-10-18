import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NotFoundReporterService } from '../services/not-found-reporter.service';

/**
 * Rotta jolly: come prima porta alla home, ma prima segnala il percorso
 * inesistente, così un link rotto (slug cambiato, URL vecchio) compare nella
 * lista 404 della dashboard invece di sparire in silenzio.
 */
export const notFoundGuard: CanActivateFn = (_route, state) => {
  inject(NotFoundReporterService).report(state.url, 'route');
  return inject(Router).parseUrl('/');
};
