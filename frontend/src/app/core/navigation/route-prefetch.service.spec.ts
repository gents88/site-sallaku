import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Routes, provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutePrefetchService, lazyLoadersFor } from './route-prefetch.service';
import { NAV_REGISTRY } from './nav-registry';
import { routes } from '../../app.routes';
import { isSlowConnection } from '../strategies/selective-preload.strategy';

const lab = vi.fn(() => Promise.resolve(class Lab {}));
const library = vi.fn(() => Promise.resolve(class Library {}));
const shell = vi.fn(() => Promise.resolve(class Shell {}));
const dashboard = vi.fn(() => Promise.resolve(class Dashboard {}));
const blog = vi.fn(() => Promise.resolve(class Blog {}));
const preview = vi.fn(() => Promise.resolve(class Preview {}));

const CONFIG: Routes = [
  { path: '', children: [
    { path: '', redirectTo: 'homepage', pathMatch: 'full' },
    { path: 'lab', loadComponent: lab },
    { path: 'lab/library', loadComponent: library },
  ] },
  { path: ':lang', children: [{ path: 'lab/library', loadComponent: vi.fn() }] },
  { path: 'dashboard/login', loadComponent: vi.fn() },
  { path: 'dashboard', loadComponent: shell, children: [
    { path: '', loadComponent: dashboard },
    { path: 'blog', loadComponent: blog },
    { path: 'blog/preview/:id', loadComponent: preview },
  ] },
  { path: '**', children: [] },
];

describe('lazyLoadersFor', () => {
  it('trova la pagina pubblica nel ramo senza prefisso lingua', () => {
    expect(lazyLoadersFor(CONFIG, '/lab/library')).toEqual([library]);
    expect(lazyLoadersFor(CONFIG, '/lab')).toEqual([lab]);
  });

  it('include la shell che contiene la pagina', () => {
    expect(lazyLoadersFor(CONFIG, '/dashboard/blog')).toEqual([shell, blog]);
  });

  it('scende nel figlio di default quando il path finisce sulla shell', () => {
    expect(lazyLoadersFor(CONFIG, '/dashboard')).toEqual([shell, dashboard]);
  });

  it('accetta i parametri di rotta', () => {
    expect(lazyLoadersFor(CONFIG, '/dashboard/blog/preview/42')).toEqual([shell, preview]);
  });

  it('non restituisce nulla per un path sconosciuto (né il catch-all)', () => {
    expect(lazyLoadersFor(CONFIG, '/non-esiste')).toEqual([]);
  });

  it('copre ogni voce della sidebar nella configurazione reale', () => {
    const missing = NAV_REGISTRY.filter(e => e.sidebar && lazyLoadersFor(routes, e.route).length === 0).map(e => e.route);
    expect(missing).toEqual([]);
  });
});

describe('isSlowConnection', () => {
  it('riconosce Data Saver e le reti 2G', () => {
    const nav = (connection: object) => ({ connection }) as unknown as Navigator;
    expect(isSlowConnection(nav({ saveData: true }))).toBe(true);
    expect(isSlowConnection(nav({ effectiveType: '2g' }))).toBe(true);
    expect(isSlowConnection(nav({ effectiveType: 'slow-2g' }))).toBe(true);
    expect(isSlowConnection(nav({ effectiveType: '4g' }))).toBe(false);
    expect(isSlowConnection({} as Navigator)).toBe(false);
    expect(isSlowConnection(undefined)).toBe(false);
  });
});

describe('RoutePrefetchService', () => {
  afterEach(() => vi.clearAllMocks());

  function service(platform = 'browser') {
    TestBed.configureTestingModule({ providers: [provideRouter(CONFIG), { provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(RoutePrefetchService);
  }

  it('avvia il download della pagina e della shell una volta sola', () => {
    const prefetch = service();
    prefetch.prefetch('/dashboard/blog');
    prefetch.prefetch('/dashboard/blog');
    expect(shell).toHaveBeenCalledTimes(1);
    expect(blog).toHaveBeenCalledTimes(1);
  });

  it('dopo un errore di rete riprova al passaggio successivo', async () => {
    const prefetch = service();
    library.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    prefetch.prefetch('/lab/library');
    await Promise.resolve();
    await Promise.resolve();
    prefetch.prefetch('/lab/library');
    expect(library).toHaveBeenCalledTimes(2);
  });

  it('non fa nulla sul server', () => {
    service('server').prefetch('/lab/library');
    expect(library).not.toHaveBeenCalled();
  });

  it('non scarica nulla con Data Saver attivo', () => {
    const prefetch = service();
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    try {
      prefetch.prefetch('/lab/library');
      expect(library).not.toHaveBeenCalled();
    } finally {
      delete (navigator as unknown as { connection?: unknown }).connection;
    }
  });
});
