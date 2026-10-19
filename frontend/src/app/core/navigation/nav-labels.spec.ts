import { describe, expect, it } from 'vitest';
import de from '../../../../public/i18n/de.json';
import en from '../../../../public/i18n/en.json';
import es from '../../../../public/i18n/es.json';
import fr from '../../../../public/i18n/fr.json';
import it_ from '../../../../public/i18n/it.json';
import pt from '../../../../public/i18n/pt.json';
import sq from '../../../../public/i18n/sq.json';

const NON_ENGLISH: Record<string, { nav: { about: string } }> = { it: it_, es, fr, de, pt, sq };

describe('Voce "About" della barra in alto', () => {
  it('in inglese resta "About"', () => {
    expect(en.nav.about).toBe('About');
  });

  for (const [lang, dict] of Object.entries(NON_ENGLISH)) {
    it(`in ${lang} è tradotta, non resta "About"`, () => {
      expect(dict.nav.about).toBeTruthy();
      expect(dict.nav.about).not.toBe('About');
    });
  }

  it('in italiano è "Chi sono", come il titolo della sezione', () => {
    expect(it_.nav.about).toBe('Chi sono');
    expect(it_.nav.about).toBe(it_.about.title);
  });
});
