import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';
import * as Prism from 'prismjs';

// No-op when sentryDsn is unset (default in dev/until a Sentry project exists).
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    tracesSampleRate: 0.1,
  });
}
// Make Prism a true global BEFORE any lazy chunk loads.
// Plugin IIFEs (prism-toolbar etc.) reference `Prism` as a free global variable;
// setting it here in the initial bundle guarantees it exists for every chunk.
// globalThis works in both browser and Node.js (SSR) contexts.
(globalThis as any).Prism = (Prism as any).default ?? Prism;
import { version } from '../package.json';
const buildDate = new Date().toISOString();
console.log(`%c[APP] Build: ${buildDate} version: 14`, 'color: #4CAF50; font-weight: bold');
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
