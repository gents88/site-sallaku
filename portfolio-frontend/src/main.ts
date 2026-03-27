import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import * as Prism from 'prismjs';
// Make Prism a true global BEFORE any lazy chunk loads.
// Plugin IIFEs (prism-toolbar etc.) reference `Prism` as a free global variable;
// setting it here in the initial bundle guarantees it exists for every chunk.
// globalThis works in both browser and Node.js (SSR) contexts.
(globalThis as any).Prism = (Prism as any).default ?? Prism;
import { version } from '../package.json';
const buildDate = new Date().toISOString();
console.log(`%c[APP] Build: ${buildDate} version: 13`, 'color: #4CAF50; font-weight: bold');
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
