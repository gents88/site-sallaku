import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { LabToolInfoComponent } from './lab-tool-info.component';
import { LanguageService } from '../../../core/services/language.service';

const IT = {
  nav: { ai_tools: 'Strumenti' },
  sidebar: { items: { scanner: 'Scanner', pdf_editor: 'Editor PDF', convert: 'Convertitore', pdf_summary: 'Riassunto PDF' } },
  lab_info: {
    about_title: 'A cosa serve', how_title: 'Come si usa', privacy_title: 'Privacy', limits_title: 'Limiti', faq_title: 'Domande frequenti',
    related_articles: 'Approfondimenti', related_tools: 'Altri strumenti', all_tools: 'Tutti gli strumenti', section_label: 'Informazioni',
    ocr: {
      about: 'Estrae il testo da foto e PDF scansionati.',
      steps: ['Carica il file', 'Scegli la lingua', 'Copia il testo'],
      privacy: 'Il file viene inviato al server e non è conservato.',
      limits: 'Fino a 30 file alla volta.',
      faq: [{ q: 'Serve registrarsi?', a: 'No.' }],
    },
  },
};

describe('LabToolInfoComponent', () => {
  function render(tool: string) {
    TestBed.configureTestingModule({ imports: [LabToolInfoComponent, TranslateModule.forRoot()], providers: [provideRouter([])] });
    TestBed.inject(LanguageService).setLang('it', false);
    const t = TestBed.inject(TranslateService);
    t.setTranslation('it', IT);
    t.use('it');
    const fixture = TestBed.createComponent(LabToolInfoComponent);
    fixture.componentRef.setInput('tool', tool);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra testo, passi, privacy, limiti e domande visibili', () => {
    const el = render('ocr');
    expect(el.querySelectorAll('h2').length).toBeGreaterThanOrEqual(5);
    expect(el.querySelector('.lab-info__text')?.textContent).toContain('Estrae il testo');
    expect(Array.from(el.querySelectorAll('ol li')).map(li => li.textContent)).toEqual(['Carica il file', 'Scegli la lingua', 'Copia il testo']);
    expect(el.textContent).toContain('Il file viene inviato al server');
    expect(el.querySelector('h3')?.textContent).toContain('Serve registrarsi?');
  });

  it('collega agli articoli (nella lingua) e agli altri strumenti', () => {
    const el = render('ocr');
    const hrefs = Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/blog/ocr-online-estrarre-testo-da-scansioni-e-foto');
    expect(hrefs).toContain('/lab/scanner');
    expect(hrefs).toContain('/lab');
  });

  it('uno strumento senza testi mostra solo i collegamenti, e uno sconosciuto niente', () => {
    const noTexts = render('pdf-search');
    expect(noTexts.querySelector('ol')).toBeNull();
    expect(noTexts.querySelectorAll('a').length).toBeGreaterThan(0);
    TestBed.resetTestingModule();
    expect(render('non-esiste').querySelector('section')).toBeNull();
  });
});
