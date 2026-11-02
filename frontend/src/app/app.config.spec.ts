import { describe, expect, it } from 'vitest';
import { withEnabledBlockingInitialNavigation } from '@angular/router';
import { routerFeatures } from './app.config';

describe('router', () => {
  it('blocca il bootstrap sulla prima navigazione: la cornice si idrata con le traduzioni della pagina già caricate', () => {
    const blocking = withEnabledBlockingInitialNavigation().ɵkind;
    expect(routerFeatures.map(feature => feature.ɵkind)).toContain(blocking);
  });
});
