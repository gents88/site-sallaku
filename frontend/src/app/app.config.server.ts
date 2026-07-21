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
 * Loads i18n JSON files from the built browser assets at server-render time.
 * This ensures SSR output contains actual translated text instead of raw keys,
 * avoiding CLS when the browser hydrates with real translations.
 */
class SsrTranslateLoader implements TranslateLoader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTranslation(lang: string): Observable<any> {
    try {
      // In production, this file lives at dist/server/server.mjs and
      // dist/browser/i18n/<lang>.json — resolve relative to this module.
      const serverDir = dirname(fileURLToPath(import.meta.url));
      const i18nPath = join(serverDir, '..', 'browser', 'i18n', `${lang}.json`);
      const json = JSON.parse(readFileSync(i18nPath, 'utf-8'));
      return of(json);
    } catch {
      // During `ng serve` or test builds the dist folder may not exist yet —
      // fall back to empty translations so the build never fails.
      return of({});
    }
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

