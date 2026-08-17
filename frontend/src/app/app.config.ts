import { ApplicationConfig, ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions, withInMemoryScrolling, withPreloading } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { cacheInterceptor } from './core/interceptors/cache.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/error-handling/global-error.handler';
import { SelectivePreloadStrategy } from './core/strategies/selective-preload.strategy';
import { environment } from '../environments/environment';
import { resolveInitialLanguage } from './core/services/language.service';

const initialLanguage = resolveInitialLanguage();

export const appConfig: ApplicationConfig = {
  providers: [
    // Zoneless: drops the zone.js polyfill (~34KB raw / 12KB gzip off every
    // page) and stops the blanket change-detection runs that zone.js
    // triggered on every timer, event and XHR.
    //
    // The app was already written in a compatible style — no NgZone usage
    // anywhere, signals throughout, and OnPush on the components that
    // matter. Components using plain properties mutated inside async
    // callbacks were audited and now call ChangeDetectorRef.markForCheck()
    // explicitly, which is what schedules a tick without zone.js.
    provideZonelessChangeDetection(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withViewTransitions({ skipInitialTransition: true }),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      withPreloading(SelectivePreloadStrategy),
    ),
    provideHttpClient(withInterceptors([authInterceptor, cacheInterceptor, errorInterceptor]), withFetch()),
    provideAnimationsAsync(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTranslateService({
      lang: initialLanguage,
      fallbackLang: 'it',
      loader: provideTranslateHttpLoader({ prefix: '/i18n/', suffix: '.json', enforceLoading: true }),
    }),
  ],
};
