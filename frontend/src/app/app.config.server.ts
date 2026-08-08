import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SwRegistrationOptions } from '@angular/service-worker';

/**
 * Loads i18n JSON files at server-render time so SSR/prerender output
 * contains actual translated text instead of raw keys.
 *
 * IMPORTANT: during `ng build`'s prerendering step, the server bundle does
 * NOT execute from its final dist location — Angular runs it from a
 * temporary directory (`.angular/prerender-root/<uuid>/main.server.mjs`)
 * that has no sibling `browser/` folder. Resolving the i18n path relative to
 * `import.meta.url` therefore silently fails during every prerender build
 * (confirmed via debug logging: `exists=false` for every language, every
 * route), which is why prerendered pages always showed raw translation keys
 * ("hero.role", "about.bio3", ...) instead of real text. `process.cwd()` is
 * stable across both prerendering and a real `node dist/server/server.mjs`
 * run (Angular always invokes the server bundle with cwd = project root),
 * so resolve from there first, falling back to the old module-relative path
 * for any environment where cwd isn't the project root.
 */
class SsrTranslateLoader implements TranslateLoader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTranslation(lang: string): Observable<any> {
    const candidates = [
      join(process.cwd(), 'public', 'i18n', `${lang}.json`),
      join(process.cwd(), 'dist', 'portfolio-frontend', 'browser', 'i18n', `${lang}.json`),
      join(dirname(fileURLToPath(import.meta.url)), '..', 'browser', 'i18n', `${lang}.json`),
    ];

    for (const path of candidates) {
      try {
        const json = JSON.parse(readFileSync(path, 'utf-8'));
        return of(json);
      } catch {
        // Try the next candidate path.
      }
    }

    // During `ng serve` or test builds none of the candidates may exist yet —
    // fall back to empty translations so the build never fails.
    return of({});
  }
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    provideNoopAnimations(),
    { provide: TranslateLoader, useClass: SsrTranslateLoader },
    // Disable service worker in SSR context — it's browser-only
    { provide: SwRegistrationOptions, useValue: { enabled: false } },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

