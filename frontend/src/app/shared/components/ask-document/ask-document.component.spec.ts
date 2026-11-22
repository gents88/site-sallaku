import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AskDocumentComponent, isAskable } from './ask-document.component';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import { LibraryChatService } from '../../../core/services/library-chat.service';

const txt = (name = 'note.txt', body = 'Gli indici accelerano le letture del database. '.repeat(3)) => new File([body], name, { type: 'text/plain' });

@Component({
  standalone: true,
  imports: [AskDocumentComponent],
  template: '<app-ask-document [file]="file()" />',
})
class Host {
  file = signal<File | null>(null);
}

function setup(initial: File | null = txt()) {
  const chat = { ask: vi.fn(() => of({ answer: 'Accelerano le letture.', grounded: true, citations: [{ page: 1, docTitle: 'note.txt' }], processingTime: 1 })) };
  const doc = { loadingTask: { destroy: vi.fn().mockResolvedValue(undefined) } };
  const pdfjs = { openDocument: vi.fn().mockResolvedValue(doc), extractPages: vi.fn().mockResolvedValue([{ page: 1, text: 'indici database' }]) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [{ provide: LibraryChatService, useValue: chat }, { provide: PdfjsService, useValue: pdfjs }],
  });
  const t = TestBed.inject(TranslateService);
  t.setTranslation('it', { ask_doc: { title: 'Chiedi', no_text: 'NIENTE TESTO', read_error: 'ERR LETTURA', no_context: 'NIENTE', error: 'ERR', sources: 'Fonti:' } });
  t.use('it');
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.file.set(initial);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const flush = async () => { for (let i = 0; i < 5; i++) { await fixture.whenStable(); TestBed.tick(); fixture.detectChanges(); } };
  const ask = el.querySelector('app-ask-document') as HTMLElement;
  const cmp = () => fixture.debugElement.children[0].componentInstance as AskDocumentComponent;
  const open = async () => { (ask.querySelector('.ask__toggle') as HTMLButtonElement).click(); await flush(); };
  const send = async (q: string) => { cmp().question = q; await cmp().ask(); await flush(); };
  return { fixture, el, chat, pdfjs, flush, open, send, cmp, host: fixture.componentInstance };
}

describe('isAskable', () => {
  it('accetta PDF, txt e md; non docx né null', () => {
    expect(isAskable(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isAskable(new File([''], 'a.PDF'))).toBe(true);
    expect(isAskable(txt('a.md'))).toBe(true);
    expect(isAskable(new File([''], 'a.docx'))).toBe(false);
    expect(isAskable(null)).toBe(false);
  });
});

describe('AskDocumentComponent', () => {
  it('senza file non mostra nulla', () => {
    expect(setup(null).el.querySelector('.ask')).toBeNull();
  });

  it('per un tipo che non sa leggere (docx) non mostra nulla', () => {
    expect(setup(new File([''], 'a.docx')).el.querySelector('.ask')).toBeNull();
  });

  it('non legge il file finché il pannello non viene aperto', () => {
    const { pdfjs, el } = setup(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(el.querySelector('.ask__panel')).toBeNull();
    expect(pdfjs.openDocument).not.toHaveBeenCalled();
  });

  it('invia solo i passaggi pertinenti con titolo file e lingua, e mostra risposta e pagine citate', async () => {
    const { open, send, chat, el } = setup();
    await open();
    await send('Come accelerano le letture gli indici?');

    expect(chat.ask).toHaveBeenCalledTimes(1);
    const [question, passages, lang] = chat.ask.mock.calls[0] as unknown as [string, { docTitle: string; page: number; text: string }[], string];
    expect(question).toBe('Come accelerano le letture gli indici?');
    expect(passages[0]).toMatchObject({ docTitle: 'note.txt', page: 1 });
    expect(lang).toBe('it');
    expect(el.textContent).toContain('Accelerano le letture.');
    expect(el.querySelector('.ask__chip')?.textContent).toContain('p. 1');
  });

  it('una domanda senza corrispondenze nel testo non chiama il server', async () => {
    const { open, send, chat, el } = setup();
    await open();
    await send('astronomia quantistica');
    expect(chat.ask).not.toHaveBeenCalled();
    expect(el.textContent).toContain('NIENTE');
  });

  it('se il server fallisce mostra un messaggio d’errore e permette di riprovare', async () => {
    const { open, send, chat, el, cmp } = setup();
    chat.ask.mockReturnValueOnce(throwError(() => new Error('429')));
    await open();
    await send('indici database');
    expect(el.textContent).toContain('ERR');
    expect(cmp().asking()).toBe(false);
  });

  it('un PDF senza testo (scansione) lo dice e non permette domande', async () => {
    const { open, pdfjs, el } = setup(new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    pdfjs.extractPages.mockResolvedValue([{ page: 1, text: '' }]);
    await open();
    expect(el.textContent).toContain('NIENTE TESTO');
    expect(el.querySelector('.ask__form')).toBeNull();
  });

  it('un PDF illeggibile mostra l’errore di lettura', async () => {
    const { open, pdfjs, el } = setup(new File(['x'], 'rotto.pdf', { type: 'application/pdf' }));
    pdfjs.openDocument.mockRejectedValue(new Error('bad pdf'));
    await open();
    expect(el.textContent).toContain('ERR LETTURA');
  });

  it('cambiando file la conversazione e la lettura ripartono da zero', async () => {
    const { open, send, host, cmp, flush } = setup();
    await open();
    await send('indici database');
    expect(cmp().messages().length).toBeGreaterThan(0);

    host.file.set(txt('altro.txt'));
    await flush();
    expect(cmp().messages()).toEqual([]);
    expect(cmp().open()).toBe(false);
    expect(cmp().state()).toBe('idle');
  });
});
