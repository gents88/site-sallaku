import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { appConfig } from './app.config';

/**
 * In SSR context there is no HTTP server to resolve relative URLs for i18n files.
 * Return empty translations — Angular renders the page with keys visible to Node,
 * but all SEO-critical content (title, description, JSON-LD, canonical) is set
 * via SeoService directly and is fully correct in the SSR output.
 */
class SsrTranslateLoader implements TranslateLoader {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTranslation(_lang: string): Observable<any> {
    return of({});
  }
}

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: TranslateLoader, useClass: SsrTranslateLoader },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

