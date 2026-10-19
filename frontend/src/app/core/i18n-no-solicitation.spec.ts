import { describe, expect, it } from 'vitest';
import de from '../../../public/i18n/de.json';
import en from '../../../public/i18n/en.json';
import es from '../../../public/i18n/es.json';
import fr from '../../../public/i18n/fr.json';
import it_ from '../../../public/i18n/it.json';
import pt from '../../../public/i18n/pt.json';
import sq from '../../../public/i18n/sq.json';

/**
 * Finché Gent lavora come dipendente il sito non deve proporre collaborazioni,
 * incarichi freelance né disponibilità. Se la situazione cambia, aggiornare
 * questo test insieme ai testi.
 */
const LANGS: Record<string, Record<string, any>> = { it: it_, en, es, fr, de, pt, sq };

/** Parole che promettono disponibilità o chiedono incarichi, per lingua. */
const SOLICITING = /freelance|disponibil|available for|disponible|disponível|verfügbar|disponibël|zur verfügung|opportunit|oportunidad|opportunités|collaborazion|collaborations|colaboraci|colabora|kooperation|bashkëpunim|hire|assum/i;

const PUBLIC_COPY: [string, (d: Record<string, any>) => unknown][] = [
  ['contact.subtitle', d => d['contact'].subtitle],
  ['contact.info.desc', d => d['contact'].info.desc],
  ['contact.form.subject_ph', d => d['contact'].form.subject_ph],
  ['chatbot_ui.welcome_text', d => d['chatbot_ui'].welcome_text],
  ['chatbot_ui.teaser_text', d => d['chatbot_ui'].teaser_text],
];

describe('Testi pubblici: nessun invito a collaborare né disponibilità', () => {
  for (const [lang, dict] of Object.entries(LANGS)) {
    for (const [key, read] of PUBLIC_COPY) {
      it(`${lang} · ${key}`, () => {
        const text = String(read(dict));
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(SOLICITING);
      });
    }

    it(`${lang} · tolti i blocchi "Hai un progetto?", FAQ sulla disponibilità e CTA dei case study`, () => {
      expect(dict['services'].contact).toBeUndefined();
      expect(dict['faq'].q3).toBeUndefined();
      expect(dict['faq'].a3).toBeUndefined();
      expect(dict['project_detail'].cta_text).toBeUndefined();
      expect(dict['project_detail'].cta_button).toBeUndefined();
    });

    it(`${lang} · le FAQ rimaste hanno domanda e risposta`, () => {
      for (const n of [1, 2, 4]) {
        expect(dict['faq'][`q${n}`], `q${n}`).toBeTruthy();
        expect(dict['faq'][`a${n}`], `a${n}`).toBeTruthy();
      }
    });
  }
});
