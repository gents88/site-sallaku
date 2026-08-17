import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/angular';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { environment } from './environments/environment';

// No-op when sentryDsn is unset (default in dev/until a Sentry project exists).
if (environment.sentryDsn) {
  Sentry.init({
    dsn: environment.sentryDsn,
    environment: environment.production ? 'production' : 'development',
    tracesSampleRate: 0.1,
  });
}
// Prism used to be imported here purely to publish `Prism` as a global before
// any lazy chunk evaluated (its plugin IIFEs read it as a free variable). That
// pulled the full core — clike/markup/css grammars and all — into the initial
// bundle of every page, when only blog/:slug ever highlights anything.
// PrismService now loads the core dynamically and sets the global itself,
// between the core and the plugins, preserving the same ordering guarantee.
import { version } from '../package.json';
const buildDate = new Date().toISOString();
console.log(`%c[APP] Build: ${buildDate} version: 14`, 'color: #4CAF50; font-weight: bold');
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
