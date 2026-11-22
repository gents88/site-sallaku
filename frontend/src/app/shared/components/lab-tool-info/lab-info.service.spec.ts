import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { LabInfoService } from './lab-info.service';
import { LanguageService } from '../../../core/services/language.service';

describe('LabInfoService', () => {
  function setup(translations: Parameters<TranslateService['setTranslation']>[1]) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const t = TestBed.inject(TranslateService);
    t.setTranslation('it', translations);
    t.use('it');
    return TestBed.inject(LabInfoService);
  }

  it('costruisce la FAQPage dalle domande visibili, nella lingua corrente', () => {
    const service = setup({ lab_info: { pdf_editor: { faq: [{ q: 'Serve registrarsi?', a: 'No.' }, { q: '', a: 'scartata' }] } } });
    expect(service.faqSchema('pdf-editor')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Serve registrarsi?', acceptedAnswer: { '@type': 'Answer', text: 'No.' } }],
    });
  });

  it('senza FAQ restituisce null (niente schema vuoto)', () => {
    const service = setup({ lab_info: {} });
    expect(service.faqSchema('ocr')).toBeNull();
  });

  describe('appFields', () => {
    function setupIn(lang: 'it' | 'de', translations: Parameters<TranslateService['setTranslation']>[1]) {
      TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
      const t = TestBed.inject(TranslateService);
      // setLang ricarica la lingua dal caricatore (vuoto nei test) e cancella le traduzioni:
      // si registrano dopo averla cambiata.
      TestBed.inject(LanguageService).setLang(lang, false);
      t.setTranslation(lang, translations);
      t.use(lang);
      return TestBed.inject(LabInfoService);
    }

    it('nome, descrizione, URL con prefisso e lingua dalla pagina corrente', () => {
      const service = setupIn('de', { pdf_editor: { seo_title: 'PDF-Editor', seo_description: 'Meta description' }, lab_info: { pdf_editor: { about: 'Erklärung.' } } });
      expect(service.appFields('pdf-editor')).toEqual({
        name: 'PDF-Editor',
        description: 'Erklärung.',
        url: 'https://gentsallaku.it/de/lab/pdf-editor',
        inLanguage: 'de',
        isAccessibleForFree: true,
      });
    });

    it('in italiano l\'URL non ha prefisso; senza "about" usa la meta description', () => {
      const service = setupIn('it', { pdf_search: { seo_title: 'Cerca Libri PDF', seo_description: 'Cerca e scarica libri.' } });
      expect(service.appFields('pdf-search')).toMatchObject({ url: 'https://gentsallaku.it/lab/pdf-search', description: 'Cerca e scarica libri.', inLanguage: 'it' });
    });
  });
});
