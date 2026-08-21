import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AiService } from './ai.service';
import { AiProviderService } from '../common/services/ai-provider.service';
import { DataConverter } from '../conversion/converters/data.converter';
import { OcrService } from '../ocr/ocr.service';
import { AskPassageDto } from './dto/ask-document.dto';

function fakeOcr(): { recognize: jest.Mock } {
  return { recognize: jest.fn() };
}

function passage(overrides: Partial<AskPassageDto> = {}): AskPassageDto {
  return {
    docTitle: 'Divina Commedia',
    page: 7,
    text: 'Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura.',
    ...overrides,
  };
}

describe('AiService.askDocument', () => {
  let service: AiService;
  let aiProvider: { chatCompletion: jest.Mock };

  beforeEach(() => {
    aiProvider = { chatCompletion: jest.fn() };
    service = new AiService(
      new ConfigService(),
      aiProvider as unknown as AiProviderService,
      new DataConverter(),
      fakeOcr() as unknown as OcrService,
    );
  });

  function replyWith(json: unknown): void {
    aiProvider.chatCompletion.mockResolvedValue(JSON.stringify(json));
  }

  it('restituisce la risposta del modello con le citazioni risolte su documento e pagina', async () => {
    replyWith({ answer: 'Parla di uno smarrimento.', grounded: true, usedPassages: [1] });

    const result = await service.askDocument('Di cosa parla?', [passage()], 'it');

    expect(result.answer).toBe('Parla di uno smarrimento.');
    expect(result.grounded).toBe(true);
    expect(result.citations).toEqual([{ page: 7, docTitle: 'Divina Commedia' }]);
  });

  it('numera i passaggi nel prompt e ne dichiara documento e pagina', async () => {
    replyWith({ answer: 'ok', usedPassages: [] });

    await service.askDocument(
      'Domanda',
      [passage(), passage({ page: 12, text: 'Secondo brano.' })],
      'it',
    );

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    const userMessage = messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).toContain('[1] (Divina Commedia, pagina 7)');
    expect(userMessage).toContain('[2] (Divina Commedia, pagina 12)');
    expect(userMessage).toContain('Domanda');
  });

  it('scarta le citazioni fuori range invece di puntare a pagine mai fornite', async () => {
    replyWith({ answer: 'ok', grounded: true, usedPassages: [1, 4, 0, -2] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([{ page: 7, docTitle: 'Divina Commedia' }]);
  });

  it('scarta gli indici non interi', async () => {
    replyWith({ answer: 'ok', usedPassages: [1.5, 'due' as unknown as number] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([]);
  });

  it('propaga grounded=false quando il modello dichiara di non aver trovato la risposta', async () => {
    replyWith({ answer: 'Gli estratti non lo dicono.', grounded: false, usedPassages: [] });

    const result = await service.askDocument('Chi ha vinto nel 1998?', [passage()], 'it');

    expect(result.grounded).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it('considera la risposta fondata quando il modello omette il campo', async () => {
    replyWith({ answer: 'Una risposta.' });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.grounded).toBe(true);
  });

  it('regge un usedPassages assente o di tipo sbagliato', async () => {
    replyWith({ answer: 'Una risposta.', usedPassages: 'tutti' });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([]);
  });

  it('chiede al modello di rispondere nella lingua richiesta', async () => {
    replyWith({ answer: 'An answer.' });

    await service.askDocument('Question?', [passage()], 'en');

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.find((m) => m.role === 'system')!.content).toContain('English');
  });

  it('ripiega sull italiano per una lingua sconosciuta', async () => {
    replyWith({ answer: 'Una risposta.' });

    await service.askDocument('Domanda', [passage()], 'xx');

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.find((m) => m.role === 'system')!.content).toContain('Italian');
  });

  it('estrae il JSON anche quando il modello lo avvolge in testo o markdown', async () => {
    aiProvider.chatCompletion.mockResolvedValue(
      'Ecco il risultato:\n```json\n{"answer":"Risposta pulita","usedPassages":[1]}\n```',
    );

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.answer).toBe('Risposta pulita');
    expect(result.citations).toHaveLength(1);
  });

  it('non lascia answer undefined se il modello lo omette', async () => {
    replyWith({ grounded: true, usedPassages: [] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.answer).toBe('');
  });
});

/** Un multer-file finto: extractText() viene mockato direttamente nei test sotto, quindi il buffer non conta. */
function fakeFile(): Express.Multer.File {
  return { buffer: Buffer.from(''), mimetype: 'application/pdf', originalname: 'x.pdf' } as Express.Multer.File;
}

/**
 * Costruisce un vero PDF (via pdf-lib) con le pagine date — usato per esercitare
 * pdf-parse davvero, non un mock. Va a capo sulle singole parole restando dentro
 * il bordo della pagina: pdf.js estrae il testo in modo inaffidabile quando una
 * riga disegnata supera la larghezza della pagina.
 */
async function pdfFileWithPages(pages: { width: number; height: number; text: string }[]): Promise<Express.Multer.File> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const margin = 20;
  for (const p of pages) {
    const page = doc.addPage([p.width, p.height]);
    let y = p.height - 40;
    let line = '';
    for (const word of p.text.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > p.width - margin * 2 && line) {
        page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
        y -= size + 4;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) page.drawText(line, { x: margin, y, size, font, color: rgb(0, 0, 0) });
  }
  const buffer = Buffer.from(await doc.save());
  return { buffer, mimetype: 'application/pdf', originalname: 'x.pdf' } as Express.Multer.File;
}

/** Un paragrafo di lunghezza nota, ripetuto: costruisce testi "corti" o "lunghi quanto serve" in modo deterministico rispetto al chunking. */
function paragraphsOfChars(totalChars: number, paragraphChars = 1200): string {
  const count = Math.ceil(totalChars / (paragraphChars + 2));
  return Array.from({ length: count }, (_, i) => `${i}-${'x'.repeat(paragraphChars)}`).join('\n\n');
}

const SUMMARY_JSON = JSON.stringify({
  title: 'Titolo', detectedType: 'Document', shortSummary: 's', longSummary: 'l', keywords: [], keyPoints: [],
});

describe('AiService.summarizeFile', () => {
  let service: AiService;
  let aiProvider: { chatCompletion: jest.Mock };

  beforeEach(() => {
    aiProvider = { chatCompletion: jest.fn() };
    service = new AiService(
      new ConfigService(),
      aiProvider as unknown as AiProviderService,
      new DataConverter(),
      fakeOcr() as unknown as OcrService,
    );
  });

  function mockCondenseAndFinal(): void {
    aiProvider.chatCompletion.mockImplementation((messages: { role: string; content: string }[]) => {
      const sys = messages.find((m) => m.role === 'system')?.content ?? '';
      return Promise.resolve(sys.includes('compress an excerpt') ? '- nota condensata' : SUMMARY_JSON);
    });
  }

  it('un documento che entra in un blocco solo fa una sola chiamata al modello', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue({ text: 'Un documento breve.', pageCount: 1 });
    mockCondenseAndFinal();

    const result = await service.summarizeFile(fakeFile(), 'it', 'short');

    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(1);
    expect(result.truncated).toBe(false);
    expect(result.title).toBe('Titolo');
  });

  it('un documento lungo viene condensato blocco per blocco prima del riassunto finale', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue({ text: paragraphsOfChars(20000), pageCount: 10 });
    mockCondenseAndFinal();

    const result = await service.summarizeFile(fakeFile(), 'it', 'short');

    // Più di una chiamata (condensazione + riassunto finale), ma entro il tetto di sicurezza.
    expect(aiProvider.chatCompletion.mock.calls.length).toBeGreaterThan(1);
    expect(aiProvider.chatCompletion.mock.calls.length).toBeLessThanOrEqual(16);
    expect(result.truncated).toBe(false);
  });

  it('il riassunto finale riceve le note condensate, non il testo grezzo intero', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue({ text: paragraphsOfChars(20000), pageCount: 10 });
    mockCondenseAndFinal();

    await service.summarizeFile(fakeFile(), 'it', 'short');

    const finalCall = aiProvider.chatCompletion.mock.calls.find(
      ([messages]: [{ role: string; content: string }[]]) =>
        !messages.find((m) => m.role === 'system')!.content.includes('compress an excerpt'),
    );
    const userContent = finalCall[0].find((m: { role: string }) => m.role === 'user').content;
    expect(userContent).toContain('nota condensata');
  });

  it('un documento oltre il tetto di sicurezza sui blocchi risulta truncated', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue({ text: paragraphsOfChars(200000), pageCount: 100 });
    mockCondenseAndFinal();

    const result = await service.summarizeFile(fakeFile(), 'it', 'short');

    // 15 blocchi condensati (il tetto) + 1 chiamata finale, non uno in più.
    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(16);
    expect(result.truncated).toBe(true);
  });

  it('rifiuta un file da cui non si estrae testo', async () => {
    jest.spyOn(service, 'extractText').mockResolvedValue({ text: '   ', pageCount: 1 });

    await expect(service.summarizeFile(fakeFile(), 'it', 'short')).rejects.toThrow();
  });
});

describe('AiService.formatText', () => {
  let service: AiService;
  let aiProvider: { chatCompletion: jest.Mock };

  beforeEach(() => {
    aiProvider = { chatCompletion: jest.fn() };
    service = new AiService(
      new ConfigService(),
      aiProvider as unknown as AiProviderService,
      new DataConverter(),
      fakeOcr() as unknown as OcrService,
    );
  });

  it('un testo che entra in un blocco solo fa una sola chiamata di formattazione più il riassunto in una frase', async () => {
    aiProvider.chatCompletion
      .mockResolvedValueOnce('# Titolo\n\nContenuto formattato.')
      .mockResolvedValueOnce('Una frase di riassunto.');

    const result = await service.formatText('Testo breve da formattare.', 'general');

    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(2);
    expect(result.truncated).toBe(false);
    expect(result.formatted).toBe('# Titolo\n\nContenuto formattato.');
  });

  it('un testo lungo viene formattato blocco per blocco e concatenato', async () => {
    let callIndex = 0;
    aiProvider.chatCompletion.mockImplementation((messages: { role: string; content: string }[]) => {
      const sys = messages.find((m) => m.role === 'system')?.content ?? '';
      if (sys.includes('summarising')) return Promise.resolve('Riassunto.');
      const isContinuation = sys.includes('continuation of the same document');
      return Promise.resolve(isContinuation ? `## Sezione ${callIndex++}` : `# Titolo\n\n## Sezione ${callIndex++}`);
    });

    const result = await service.formatText(paragraphsOfChars(20000), 'report');

    expect(result.formatted).toContain('# Titolo');
    expect((result.formatted.match(/## Sezione/g) || []).length).toBeGreaterThan(1);
    // Un solo titolo di primo livello: i blocchi successivi non ne aggiungono un altro.
    expect((result.formatted.match(/^# /gm) || []).length).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('conteggia parole e sezioni sul documento intero, non solo sul primo blocco', async () => {
    aiProvider.chatCompletion.mockImplementation((messages: { role: string; content: string }[]) => {
      const sys = messages.find((m) => m.role === 'system')?.content ?? '';
      if (sys.includes('summarising')) return Promise.resolve('Riassunto.');
      const isContinuation = sys.includes('continuation of the same document');
      return Promise.resolve(isContinuation ? '## altra sezione con altre parole' : '# T\n\n## prima sezione con parole');
    });

    const result = await service.formatText(paragraphsOfChars(20000), 'report');

    expect(result.sections).toBeGreaterThan(1);
    expect(result.wordCount).toBeGreaterThan(6);
  });

  it('un testo oltre il tetto di sicurezza sui blocchi risulta truncated', async () => {
    aiProvider.chatCompletion.mockResolvedValue('## sezione');

    const result = await service.formatText(paragraphsOfChars(200000), 'general');

    // 15 blocchi formattati (il tetto) + 1 chiamata per il riassunto in una frase.
    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(16);
    expect(result.truncated).toBe(true);
  });
});

describe('AiService.translatePdf', () => {
  let service: AiService;
  let aiProvider: { chatCompletion: jest.Mock };
  let ocr: { recognize: jest.Mock };

  beforeEach(() => {
    aiProvider = { chatCompletion: jest.fn() };
    ocr = fakeOcr();
    // DataConverter reale, non mockato: verifica che textToPdf() funzioni
    // davvero sul testo tradotto e che il fallback scatti su un vero errore
    // di pdf-lib, non su uno simulato.
    service = new AiService(
      new ConfigService(),
      aiProvider as unknown as AiProviderService,
      new DataConverter(),
      ocr as unknown as OcrService,
    );
  });

  function mockExtract(result: { text: string; pageCount: number; isScanned?: boolean }): jest.SpyInstance {
    return jest
      .spyOn(service as unknown as { extractTextWithOcrFallback: (f: unknown) => Promise<unknown> }, 'extractTextWithOcrFallback')
      .mockResolvedValue({ isScanned: false, ...result });
  }

  it('un documento che entra in un blocco solo fa una sola chiamata e produce un PDF vero', async () => {
    mockExtract({ text: 'Un documento breve da tradurre.', pageCount: 1 });
    aiProvider.chatCompletion.mockResolvedValue('A short translated document.');

    const result = await service.translatePdf(fakeFile(), 'english', false);

    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(1);
    expect(result.translatedText).toBe('A short translated document.');
    expect(result.pdfBase64).not.toBeNull();
    expect(result.layoutPreserved).toBe(false);
    expect(result.fallback).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('un documento lungo viene tradotto blocco per blocco e i risultati concatenati in ordine', async () => {
    mockExtract({ text: paragraphsOfChars(20000), pageCount: 10 });
    let n = 0;
    aiProvider.chatCompletion.mockImplementation(() => Promise.resolve(`parte-tradotta-${n++}`));

    const result = await service.translatePdf(fakeFile(), 'english', false);

    expect(result.translatedText).toBe('parte-tradotta-0\n\nparte-tradotta-1\n\nparte-tradotta-2');
    expect(result.truncated).toBe(false);
  });

  it('ripiega su solo-testo quando la traduzione contiene caratteri che il font PDF standard non incodifica', async () => {
    mockExtract({ text: 'A short document.', pageCount: 1 });
    aiProvider.chatCompletion.mockResolvedValue('这是一个中文翻译示例');

    const result = await service.translatePdf(fakeFile(), 'chinese', false);

    expect(result.pdfBase64).toBeNull();
    expect(result.fallback).toBe(true);
    expect(result.translatedText).toBe('这是一个中文翻译示例');
  });

  it('un documento oltre il tetto di sicurezza sui blocchi risulta truncated', async () => {
    mockExtract({ text: paragraphsOfChars(200000), pageCount: 100 });
    aiProvider.chatCompletion.mockResolvedValue('tradotto');

    const result = await service.translatePdf(fakeFile(), 'english', false);

    expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(15);
    expect(result.truncated).toBe(true);
  });

  it('rifiuta un file da cui non si estrae testo', async () => {
    mockExtract({ text: '', pageCount: 1 });

    await expect(service.translatePdf(fakeFile(), 'english', false)).rejects.toThrow();
  });

  it('wordCount e blocksTranslated restano calcolati sul testo originale per intero', async () => {
    const original = paragraphsOfChars(20000);
    mockExtract({ text: original, pageCount: 10 });
    aiProvider.chatCompletion.mockResolvedValue('tradotto');

    const result = await service.translatePdf(fakeFile(), 'english', false);

    expect(result.wordCount).toBe(original.trim().split(/\s+/).filter(Boolean).length);
  });

  describe('modalità High Fidelity (pagina per pagina)', () => {
    it('con highFidelity=true traduce pagina per pagina e mantiene numero e dimensione delle pagine originali', async () => {
      const file = await pdfFileWithPages([
        { width: 300, height: 300, text: 'Pagina uno originale, con abbastanza testo da superare la soglia di rilevamento.' },
        { width: 400, height: 200, text: 'Pagina due originale, anch essa con abbastanza testo da avere un text layer vero.' },
      ]);
      let n = 0;
      aiProvider.chatCompletion.mockImplementation(() => Promise.resolve(`pagina-tradotta-${n++}`));

      const result = await service.translatePdf(file, 'english', true);

      expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(2);
      expect(result.layoutPreserved).toBe(true);
      expect(result.pdfBase64).not.toBeNull();
      expect(result.blocksTranslated).toBe(2);
      expect(result.translatedText).toBe('pagina-tradotta-0\n\npagina-tradotta-1');

      const rebuilt = await PDFDocument.load(Buffer.from(result.pdfBase64 as string, 'base64'));
      expect(rebuilt.getPageCount()).toBe(2);
      expect(rebuilt.getPage(0).getSize()).toEqual({ width: 300, height: 300 });
      expect(rebuilt.getPage(1).getSize()).toEqual({ width: 400, height: 200 });
    });

    it('con highFidelity=false traduce a blocchi anche se il file ha più pagine con testo', async () => {
      const file = await pdfFileWithPages([
        { width: 300, height: 300, text: 'Pagina uno originale, con abbastanza testo da superare la soglia di rilevamento.' },
        { width: 300, height: 300, text: 'Pagina due originale, anch essa con abbastanza testo da avere un text layer vero.' },
      ]);
      aiProvider.chatCompletion.mockResolvedValue('tradotto');

      const result = await service.translatePdf(file, 'english', false);

      expect(aiProvider.chatCompletion).toHaveBeenCalledTimes(1);
      expect(result.layoutPreserved).toBe(false);
    });

    it('se la costruzione del PDF paginato fallisce, ripiega sulla modalità Standard invece di far fallire la richiesta', async () => {
      mockExtract({ text: 'Un documento breve da tradurre.', pageCount: 1 });
      jest
        .spyOn(service as unknown as { tryBuildPagedTranslatedPdf: () => Promise<unknown> }, 'tryBuildPagedTranslatedPdf')
        .mockResolvedValue(null);
      aiProvider.chatCompletion.mockResolvedValue('A short translated document.');

      const result = await service.translatePdf(fakeFile(), 'english', true);

      expect(result.layoutPreserved).toBe(false);
      expect(result.pdfBase64).not.toBeNull();
      expect(result.translatedText).toBe('A short translated document.');
    });

    it('salta la modalità pagina-per-pagina sui documenti scansionati (niente text layer con posizioni)', async () => {
      mockExtract({ text: 'Testo riconosciuto via OCR.', pageCount: 1, isScanned: true });
      const pagedSpy = jest.spyOn(
        service as unknown as { tryBuildPagedTranslatedPdf: () => Promise<unknown> },
        'tryBuildPagedTranslatedPdf',
      );
      aiProvider.chatCompletion.mockResolvedValue('OCR-recognized text, translated.');

      const result = await service.translatePdf(fakeFile(), 'english', true);

      expect(pagedSpy).not.toHaveBeenCalled();
      expect(result.layoutPreserved).toBe(false);
      expect(result.isScanned).toBe(true);
    });
  });
});

describe('AiService — estrazione con fallback OCR sui PDF scansionati', () => {
  let service: AiService;
  let ocr: { recognize: jest.Mock };

  beforeEach(() => {
    ocr = fakeOcr();
    service = new AiService(
      new ConfigService(),
      { chatCompletion: jest.fn() } as unknown as AiProviderService,
      new DataConverter(),
      ocr as unknown as OcrService,
    );
  });

  function extract(file: Express.Multer.File): Promise<{ text: string; pageCount: number; isScanned: boolean }> {
    return (service as unknown as { extractTextWithOcrFallback: (f: Express.Multer.File) => Promise<{ text: string; pageCount: number; isScanned: boolean }> })
      .extractTextWithOcrFallback(file);
  }

  it('un PDF con testo nativo su tutte le pagine non chiama l’OCR', async () => {
    const file = await pdfFileWithPages([
      { width: 300, height: 300, text: 'Prima pagina con un paragrafo di testo vero, ben oltre la soglia minima di caratteri.' },
      { width: 300, height: 300, text: 'Seconda pagina con un altro paragrafo di testo vero, anch esso oltre la soglia minima.' },
    ]);

    const result = await extract(file);
    const normalized = result.text.replace(/\s+/g, ' ');

    expect(ocr.recognize).not.toHaveBeenCalled();
    expect(result.isScanned).toBe(false);
    expect(result.pageCount).toBe(2);
    // Il testo estratto va a capo dove il PDF va a capo (righe separate → newline reali): si normalizza lo spazio prima del confronto.
    expect(normalized).toContain('Prima pagina con un paragrafo di testo vero, ben oltre la soglia minima di caratteri.');
    expect(normalized).toContain('Seconda pagina con un altro paragrafo di testo vero, anch esso oltre la soglia minima.');
  });

  it('una pagina senza text layer viene rasterizzata e passata a Tesseract, e il risultato OCR sostituisce il testo mancante', async () => {
    const file = await pdfFileWithPages([
      { width: 300, height: 300, text: 'Prima pagina con un paragrafo di testo vero, ben oltre la soglia minima di caratteri.' },
      { width: 300, height: 300, text: '' }, // nessun testo disegnato: come una pagina scansionata
    ]);
    ocr.recognize.mockResolvedValue({ lang: 'eng+ita', pages: [{ index: 0, text: 'Testo riconosciuto via OCR.', confidence: 90 }], text: 'Testo riconosciuto via OCR.' });

    const result = await extract(file);
    const normalized = result.text.replace(/\s+/g, ' ');

    expect(ocr.recognize).toHaveBeenCalledTimes(1);
    const [buffers] = ocr.recognize.mock.calls[0];
    expect(buffers).toHaveLength(1);
    expect(result.isScanned).toBe(true);
    expect(normalized).toContain('Prima pagina con un paragrafo di testo vero, ben oltre la soglia minima di caratteri.');
    expect(normalized).toContain('Testo riconosciuto via OCR.');
  });
});
