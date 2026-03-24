import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import * as Prism from 'prismjs';
// Make Prism a true global BEFORE any lazy chunk loads.
// Plugin IIFEs (prism-toolbar etc.) reference `Prism` as a free global variable;
// setting it here in the initial bundle guarantees it exists for every chunk.
// globalThis works in both browser and Node.js (SSR) contexts.
(globalThis as any).Prism = (Prism as any).default ?? Prism;
console.log('%c[APP] Build: 2026-03-24 v6', 'color: #4CAF50; font-weight: bold');
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
