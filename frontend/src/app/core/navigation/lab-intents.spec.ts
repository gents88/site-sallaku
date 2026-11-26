import { describe, expect, it } from 'vitest';
import { LAB_INTENTS, labIntent } from './lab-intents';
import { NAV_REGISTRY } from './nav-registry';
import { labToolIdForUrl } from './lab-tools';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('lab-intents', () => {
  it('ogni intento è nel registro, con rotta /lab/<id> e strumento padre esistente', () => {
    for (const [id, def] of Object.entries(LAB_INTENTS)) {
      const entry = NAV_REGISTRY.find(e => e.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry!.route).toBe(`/lab/${id}`);
      expect(NAV_REGISTRY.some(e => e.id === def.tool), `${id} → ${def.tool}`).toBe(true);
    }
  });

  it('labIntent riconosce solo gli intenti', () => {
    expect(labIntent('merge-pdf')?.tool).toBe('pdf-editor');
    expect(labIntent('ocr')).toBeNull();
    expect(labIntent('constructor')).toBeNull();
    expect(labIntent(null)).toBeNull();
  });

  it('l\'URL di un intento risale allo strumento padre', () => {
    expect(labToolIdForUrl('/lab/merge-pdf')).toBe('pdf-editor');
  });

  it('ogni intento con conversione ha il testo del pulsante in tutte le lingue (niente chiavi grezze)', () => {
    const langs = ['it', 'en', 'es', 'fr', 'de', 'pt', 'sq'];
    for (const lang of langs) {
      const json = JSON.parse(readFileSync(join(process.cwd(), 'public/i18n', `${lang}.json`), 'utf8'));
      for (const [id, def] of Object.entries(LAB_INTENTS)) {
        if (!def.conversion) continue;
        const key = id.replace(/-/g, '_');
        expect(json.lab_intents?.[key]?.cta, `${lang}: lab_intents.${key}.cta`).toBeTruthy();
      }
    }
  });
});
