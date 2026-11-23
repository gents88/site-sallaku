import { describe, expect, it } from 'vitest';
import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

describe('serverRoutes — area admin', () => {
  it('/dashboard e tutto ciò che sta sotto non si prerenderizzano (se no una pagina admin diventa "Redirecting to /dashboard/login")', () => {
    const modeOf = (path: string) => serverRoutes.find((r) => r.path === path)?.renderMode;
    expect(modeOf('dashboard')).toBe(RenderMode.Client);
    expect(modeOf('dashboard/**')).toBe(RenderMode.Client);
  });

  it('le regole dell\'area admin vengono prima di `:lang/<pagina>`, che altrimenti cattura "dashboard" come lingua', () => {
    const paths = serverRoutes.map((r) => r.path);
    const firstLangRoute = paths.findIndex((p) => p.startsWith(':lang/'));
    expect(paths.indexOf('dashboard/**')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('dashboard/**')).toBeLessThan(firstLangRoute);
  });
});
