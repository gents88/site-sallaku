import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { LabInfoService } from './lab-info.service';

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
});
