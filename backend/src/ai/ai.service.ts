import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AiProviderService } from '../common/services/ai-provider.service';
import { AskPassageDto as AskPassage } from './dto/ask-document.dto';
import { chunkText } from './text-chunking';
import { DataConverter } from '../conversion/converters/data.converter';
import { OcrService } from '../ocr/ocr.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth');

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = 'openai/gpt-oss-120b';
  // Provider alternativo (Gemini) — tenuto per eventuale ripristino futuro, vedi callGemini() più sotto.
  // private readonly geminiModel = 'gemini-flash-lite-latest';

  constructor(
    private readonly config: ConfigService,
    private readonly aiProvider: AiProviderService,
    private readonly dataConverter: DataConverter,
    private readonly ocrService: OcrService,
  ) {}

  /**
   * Tetto di sicurezza sul numero di blocchi processati per documento: oltre
   * questo, un file resta (onestamente) troncato piuttosto che far esplodere
   * latenza e costo su un input patologicamente grande. ~15 blocchi coprono
   * comodamente la quasi totalità dei documenti reali che un utente carica
   * in questi tool (nell'ordine delle decine di pagine, non centinaia).
   */
  private readonly MAX_CHUNKS = 15;

  /** Sotto questa soglia di caratteri, una pagina PDF è considerata priva di text layer (scansione). Stessa soglia usata dal tool OCR lato client. */
  private static readonly MIN_PAGE_TEXT_CHARS = 40;
  /** Tetto sul numero di pagine rasterizzate e mandate a Tesseract per documento: l'OCR è lento, oltre questo le pagine restano senza testo estratto. */
  private static readonly MAX_OCR_PAGES = 20;
  /**
   * Lingua sorgente fissa per l'OCR di fallback: questo tool non ha (ancora) un
   * selettore di lingua sorgente come /lab/ocr, quindi si usa un default fisso
   * che copre i due casi più probabili per un sito rivolto principalmente a
   * utenti italiani. Tesseract accetta più lingue combinate con "+".
   */
  private static readonly OCR_FALLBACK_LANG = 'eng+ita';

  // ── TEXT EXTRACTION ──────────────────────────────────────────────────

  async extractText(file: Express.Multer.File): Promise<{ text: string; pageCount: number }> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';

    if (file.mimetype === 'application/pdf' || ext === 'pdf') {
      const parser = new PDFParse({ data: file.buffer });
      const data = await parser.getText() as { text: string; total: number };
      await parser.destroy();
      return { text: data.text ?? '', pageCount: data.total ?? 1 };
    }

    if (file.mimetype === 'text/plain' || ext === 'txt') {
      return { text: file.buffer.toString('utf-8'), pageCount: 1 };
    }

    if (ext === 'docx' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer: file.buffer }) as { value: string };
      return { text: result.value, pageCount: 1 };
    }

    throw new BadRequestException(`Unsupported file type: ${file.mimetype || ext}. Supported: PDF, TXT, DOCX.`);
  }

  // ── GROQ API (provider attivo) ──────────────────────────────────────────

  private async callGroq(messages: GroqMessage[], maxTokens = 2048): Promise<string> {
    return this.aiProvider.chatCompletion(messages, {
      model: this.model,
      maxTokens,
      timeoutMs: 60_000,
    });
  }

  // ── GOOGLE GEMINI API (disattivato, tenuto per eventuale ripristino futuro) ──
  //
  // private async callGemini(messages: GroqMessage[], maxTokens = 2048): Promise<string> {
  //   const apiKey = this.config.get<string>('GEMINI_API_KEY');
  //   if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  //
  //   const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  //   const contents = messages
  //     .filter((m) => m.role !== 'system')
  //     .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  //
  //   const res = await fetch(
  //     `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${apiKey}`,
  //     {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         ...(systemText ? { system_instruction: { parts: [{ text: systemText }] } } : {}),
  //         contents,
  //         generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  //       }),
  //       signal: AbortSignal.timeout(60_000),
  //     },
  //   );
  //
  //   if (!res.ok) {
  //     const text = await res.text();
  //     this.logger.error(`Gemini ${res.status}: ${text}`);
  //     throw new Error(`Gemini API error ${res.status}`);
  //   }
  //
  //   const data = await res.json() as {
  //     candidates?: { content?: { parts?: { text?: string }[] } }[];
  //   };
  //   return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  // }

  private parseJson<T>(raw: string): T {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in AI response');
    return JSON.parse(match[0]) as T;
  }

  // ── SUMMARIZE FILE ───────────────────────────────────────────────────

  private static readonly SUMMARIZE_CHUNK_CHARS = 8000;

  private summarizeLangName(lang: string): string {
    const langMap: Record<string, string> = {
      it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', sq: 'Albanian',
    };
    return langMap[lang] || 'English';
  }

  /** Condensa un singolo blocco in poche righe puntate — il passo "map" del riassunto a blocchi. */
  private async condenseChunk(chunk: string, index: number, total: number, responseLang: string): Promise<string> {
    return this.callGroq([
      {
        role: 'system',
        content: `You compress an excerpt of a longer document into 3-6 concise bullet points capturing its key facts and ideas. Output ONLY the bullet points (one per line, starting with "- "), no preamble, no markdown headers. Respond in ${responseLang}.`,
      },
      { role: 'user', content: `Excerpt ${index + 1} of ${total}:\n\n${chunk}` },
    ], 300);
  }

  /**
   * Riassume l'intero documento, non solo le sue prime pagine.
   *
   * Un documento che entra in un blocco singolo (la maggioranza, in pratica)
   * fa esattamente la stessa unica chiamata di prima — nessuna latenza in
   * più per il caso comune. Un documento più lungo viene invece condensato
   * blocco per blocco (map) e i risultati vengono poi riassunti insieme
   * (reduce) con lo stesso prompt e la stessa forma JSON di sempre: il
   * contratto con il frontend resta identico, cambia solo quanto del
   * documento viene davvero letto.
   */
  async summarizeFile(file: Express.Multer.File, lang: string, mode: string) {
    const start = Date.now();
    const { text, pageCount } = await this.extractText(file);
    if (!text.trim()) throw new BadRequestException('Could not extract text from file.');

    const responseLang = this.summarizeLangName(lang);
    const allChunks = chunkText(text, AiService.SUMMARIZE_CHUNK_CHARS);
    const chunks = allChunks.slice(0, this.MAX_CHUNKS);
    const truncated = allChunks.length > this.MAX_CHUNKS;

    let documentSection = chunks[0] ?? '';
    if (chunks.length > 1) {
      // Sequenziale, non Promise.all: in parallelo un documento a 15 blocchi
      // spara 15 richieste simultanee all'API Groq, rischiando di sbattere
      // contro il suo rate limit. La latenza in più è accettabile: l'utente
      // ha già premuto "riassumi" e si aspetta un'attesa su un file lungo.
      const notes: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        notes.push(await this.condenseChunk(chunks[i], i, chunks.length, responseLang));
      }
      documentSection = notes.join('\n');
    }

    const raw = await this.callGroq([
      {
        role: 'system',
        content: `You are a document analysis expert. Respond ONLY with valid JSON, no markdown. Respond in ${responseLang}.`,
      },
      {
        role: 'user',
        content: `Analyze this document and return JSON with these exact fields:
{
  "title": "concise document title",
  "detectedType": "document type (Business Report, Academic Paper, Meeting Notes, Legal Document, Article, etc.)",
  "shortSummary": "1-2 sentence summary",
  "longSummary": "detailed paragraph summary (4-6 sentences)",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "keyPoints": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"]
}

Document${chunks.length > 1 ? ' (condensed section by section, covers the full text)' : ''}:
${documentSection}`,
      },
    ], 1024);

    interface SummaryJson {
      title?: string;
      detectedType?: string;
      shortSummary?: string;
      longSummary?: string;
      keywords?: string[];
      keyPoints?: string[];
    }

    const result = this.parseJson<SummaryJson>(raw);
    return {
      title: result.title || 'Untitled Document',
      detectedType: result.detectedType || 'Document',
      shortSummary: result.shortSummary || '',
      longSummary: result.longSummary || '',
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
      keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
      pageCount,
      // true solo se il documento supera anche il tetto di sicurezza sui blocchi —
      // nella pratica, quasi sempre false: il riassunto copre l'intero testo.
      truncated,
      processingTime: Date.now() - start,
    };
  }

  // ── FORMAT TEXT ──────────────────────────────────────────────────────

  private static readonly FORMAT_CHUNK_CHARS = 6000;

  private formatDocDesc(docType: string): string {
    const docDesc: Record<string, string> = {
      general:           'a clean, professional document',
      business_proposal: 'a business proposal (executive summary, problem, solution, pricing, next steps)',
      report:            'a formal report (introduction, findings, analysis, recommendations)',
      meeting_notes:     'structured meeting notes (attendees, agenda, decisions, action items)',
      resume:            'a professional résumé (summary, experience, skills, education)',
      article:           'an article (headline, intro, sections, conclusion)',
    };
    return docDesc[docType] || docDesc.general;
  }

  /**
   * Formatta un blocco di testo. Il primo blocco riceve le istruzioni complete
   * (titolo, struttura del documento); i successivi proseguono nello stesso
   * stile senza reintrodurre un titolo di primo livello — sono la stessa
   * pagina, non documenti separati.
   */
  private async formatChunk(chunk: string, docType: string, isFirst: boolean): Promise<string> {
    const continuation = isFirst
      ? ''
      : ' This is a continuation of the same document — do NOT add a top-level # title or re-introduce the document, just continue with ## / ### sections as appropriate.';
    return this.callGroq([
      {
        role: 'system',
        content: `You are an expert document formatter. Transform raw text into well-structured Markdown.
Use # for title, ## for sections, ### for subsections, - for bullets, **bold** for emphasis.
Create ${this.formatDocDesc(docType)}.${continuation} Return ONLY the formatted Markdown.`,
      },
      { role: 'user', content: `Format this text as a ${docType} document:\n\n${chunk}` },
    ], 2048);
  }

  /**
   * Formatta il testo intero, non solo i primi ~6000 caratteri incollati.
   * Un testo che entra in un blocco singolo fa la stessa unica chiamata di
   * prima; uno più lungo viene formattato blocco per blocco e concatenato —
   * la formattazione è per sua natura locale, non serve un passo di reduce.
   */
  async formatText(text: string, docType: string) {
    const start = Date.now();

    const allChunks = chunkText(text, AiService.FORMAT_CHUNK_CHARS);
    const chunks = allChunks.slice(0, this.MAX_CHUNKS);
    const truncated = allChunks.length > this.MAX_CHUNKS;

    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      parts.push(await this.formatChunk(chunks[i], docType, i === 0));
    }
    const formatted = parts.join('\n\n');

    const wordCount = formatted.trim().split(/\s+/).filter(Boolean).length;
    const sections = (formatted.match(/^#{1,3} /gm) || []).length;

    const summary = await this.callGroq([
      { role: 'system', content: 'Generate a single sentence summarising what this document is about. Just the sentence, nothing else.' },
      { role: 'user', content: formatted.substring(0, 800) },
    ], 120);

    return { formatted, wordCount, sections, summary: summary.trim(), truncated, processingTime: Date.now() - start };
  }

  // ── GENERATE PPT ─────────────────────────────────────────────────────

  async generatePpt(
    topic: string,
    slideCount: number,
    style: string,
    contextFile?: Express.Multer.File,
  ) {
    const start = Date.now();

    const styleDesc: Record<string, string> = {
      business:   'corporate, professional, data-driven',
      education:  'academic, informative, step-by-step learning',
      minimal:    'clean, simple, whitespace-focused',
      modern:     'vibrant, creative, contemporary',
      pitch_deck: 'startup-focused, persuasive, investor-ready',
    };

    let contextSection = '';
    if (contextFile) {
      const { text } = await this.extractText(contextFile);
      if (text.trim()) contextSection = `\n\nContext from uploaded file:\n${text.substring(0, 3000)}`;
    }

    const raw = await this.callGroq([
      {
        role: 'system',
        content: `You are an expert presentation designer. Create structured slides. Style: ${styleDesc[style] || styleDesc.modern}. Return ONLY valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: `Create a ${slideCount}-slide presentation on: "${topic}"${contextSection}

Return JSON:
{
  "title": "presentation title",
  "slides": [
    { "title": "slide title", "content": "bullet 1\\nbullet 2\\nbullet 3", "notes": "speaker notes" }
  ]
}

Rules:
- Exactly ${slideCount} slides
- Each slide: 3-5 bullet points in "content" (newline-separated)
- Slide 1: overview/title, last slide: conclusion/next steps
- Speaker notes: 1-2 sentences per slide`,
      },
    ], 4000);

    interface PptJson {
      title?: string;
      slides?: { title?: string; content?: string; notes?: string }[];
    }

    const result = this.parseJson<PptJson>(raw);
    return {
      title: result.title || topic,
      style,
      slideCount: result.slides?.length ?? 0,
      processingTime: Date.now() - start,
      slides: (result.slides ?? []).map((s) => ({
        title: s.title || '',
        content: s.content || '',
        notes: s.notes || '',
      })),
    };
  }

  // ── ASK DOCUMENT (RAG) ───────────────────────────────────────────────

  /**
   * Risponde a una domanda usando SOLO i passaggi forniti dal client.
   *
   * Il recupero dei passaggi avviene nel browser — la Libreria vive in
   * IndexedDB e il server non possiede i documenti — quindi qui non c'è
   * nessuna ricerca da fare: il compito del modello è rispondere restando
   * dentro il contesto ricevuto e citare le pagine da cui ha attinto.
   */
  async askDocument(question: string, passages: AskPassage[], lang: string) {
    const start = Date.now();

    const langMap: Record<string, string> = {
      it: 'Italian', en: 'English', es: 'Spanish', fr: 'French',
      de: 'German', pt: 'Portuguese', sq: 'Albanian',
    };
    const responseLang = langMap[lang] || 'Italian';

    // I passaggi sono numerati: il modello cita per numero e noi rimappiamo
    // sul documento/pagina reali, così una citazione inventata non può
    // puntare a una pagina che non gli abbiamo mai mostrato.
    const context = passages
      .map((p, i) => `[${i + 1}] (${p.docTitle}, pagina ${p.page})\n${p.text}`)
      .join('\n\n');

    const raw = await this.callGroq([
      {
        role: 'system',
        content: `You answer questions strictly from the provided excerpts of a user's own documents.
Rules:
- Use ONLY the excerpts. Never rely on outside knowledge.
- If the excerpts do not contain the answer, say so plainly and set "grounded" to false.
- Cite the excerpt numbers you actually used in "usedPassages".
- Answer in ${responseLang}.
Respond ONLY with valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: `Excerpts:\n\n${context}\n\nQuestion: ${question}\n\nReturn JSON:
{
  "answer": "the answer, in ${responseLang}",
  "grounded": true,
  "usedPassages": [1, 2]
}`,
      },
    ], 1200);

    interface AskJson {
      answer?: string;
      grounded?: boolean;
      usedPassages?: number[];
    }

    const result = this.parseJson<AskJson>(raw);
    const used = Array.isArray(result.usedPassages) ? result.usedPassages : [];

    return {
      answer: (result.answer ?? '').trim(),
      grounded: result.grounded !== false,
      citations: used
        // Scarta gli indici fuori range: un modello che cita "[7]" avendone
        // ricevuti 4 non deve produrre una citazione a una pagina inesistente.
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= passages.length)
        .map((n) => ({
          page: passages[n - 1].page,
          docTitle: passages[n - 1].docTitle,
        })),
      processingTime: Date.now() - start,
    };
  }

  /**
   * Come extractText, ma per i PDF prova prima il text layer nativo pagina per
   * pagina e, solo per quelle che ne sono prive (scansioni), rasterizza ed
   * esegue OCR — invece di restituire testo vuoto e far fallire l'intera
   * richiesta. Le pagine con testo nativo restano quelle (gratis, istantaneo);
   * solo quelle senza vanno in coda a Tesseract, fino a MAX_OCR_PAGES.
   */
  private async extractTextWithOcrFallback(
    file: Express.Multer.File,
  ): Promise<{ text: string; pageCount: number; isScanned: boolean }> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = file.mimetype === 'application/pdf' || ext === 'pdf';
    if (!isPdf) {
      const { text, pageCount } = await this.extractText(file);
      return { text, pageCount, isScanned: false };
    }

    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = (await parser.getText()) as { pages: { num: number; text: string }[]; text: string; total: number };
      const pageCount = result.total ?? result.pages.length;
      const checkCount = Math.min(result.pages.length, AiService.MAX_OCR_PAGES);
      const blankPages = result.pages
        .slice(0, checkCount)
        .filter((p) => p.text.trim().length < AiService.MIN_PAGE_TEXT_CHARS);

      if (blankPages.length === 0) {
        return { text: result.text ?? '', pageCount, isScanned: false };
      }

      this.logger.log(`OCR fallback: ${blankPages.length}/${checkCount} page(s) with no text layer, rasterizing for OCR`);
      const shots = (await parser.getScreenshot({ partial: blankPages.map((p) => p.num), scale: 2 })) as {
        pages: { pageNumber: number; data: Uint8Array }[];
      };
      const ocrResult = await this.ocrService.recognize(
        shots.pages.map((p) => Buffer.from(p.data)),
        AiService.OCR_FALLBACK_LANG,
      );
      const ocrByPage = new Map(blankPages.map((p, i) => [p.num, ocrResult.pages[i]?.text ?? '']));

      const text = result.pages
        .map((p) => (ocrByPage.has(p.num) ? (ocrByPage.get(p.num) ?? '') : p.text))
        .filter(Boolean)
        .join('\n\n');

      return { text, pageCount, isScanned: true };
    } finally {
      await parser.destroy();
    }
  }

  // ── TRANSLATE PDF ────────────────────────────────────────────────────

  private static readonly TRANSLATE_CHUNK_CHARS = 10000;

  private async translateChunk(chunk: string, targetLanguage: string): Promise<string> {
    return this.callGroq([
      {
        role: 'system',
        content: `You are a professional translator. Translate the provided text to ${targetLanguage}.
Preserve paragraph structure and formatting markers. Return ONLY the translated text.`,
      },
      { role: 'user', content: `Translate to ${targetLanguage}:\n\n${chunk}` },
    ], 3000);
  }

  /**
   * Prova a impaginare il testo tradotto in un PDF vero e proprio (font
   * standard, layout pulito, non quello originale). Ritorna null quando la
   * traduzione contiene caratteri che il font standard non sa incodificare
   * (script non latini: cinese, giapponese, russo, e i segni diacritici
   * estesi del polacco) — pdf-lib in quel caso lancia invece di produrre
   * un PDF corrotto o con testo mancante, quindi qui si intercetta e si
   * ripiega onestamente su solo-testo, invece di far fallire l'intera richiesta.
   */
  private async tryBuildTranslatedPdf(text: string): Promise<string | null> {
    try {
      const buffer = await this.dataConverter.textToPdf(text);
      return buffer.toString('base64');
    } catch (err) {
      this.logger.warn(`PDF generation skipped (unsupported characters for the target language): ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Modalità "High Fidelity": traduce pagina per pagina (non a blocchi di
   * ~10000 caratteri come lo Standard) e ricostruisce il PDF con lo stesso
   * numero di pagine dell'originale, ciascuna della stessa dimensione — se una
   * pagina tradotta non ci sta nello spazio originale, prosegue su pagine
   * aggiuntive della stessa dimensione invece di rimpicciolire il carattere
   * all'infinito o perdere contenuto. Non preserva font, immagini o posizione
   * esatta dei singoli blocchi: pdf-lib non ha accesso alle coordinate del
   * testo originale, solo pdf.js le avrebbe, e usarlo lato server in questo
   * ambiente si è rivelato inaffidabile (import che non termina mai). Resta
   * comunque un miglioramento reale sullo Standard: pagine e formato coerenti
   * con l'originale, non un unico flusso di testo reimpaginato da zero.
   *
   * Ritorna null (facendo ricadere il chiamante sullo Standard) quando il file
   * non è un PDF, non ha testo pagina per pagina, o la traduzione contiene
   * caratteri che il font standard non sa incodificare.
   */
  private async tryBuildPagedTranslatedPdf(
    file: Express.Multer.File,
    targetLanguage: string,
  ): Promise<{ pdfBase64: string; translatedText: string; pageCount: number; truncated: boolean } | null> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    const isPdf = file.mimetype === 'application/pdf' || ext === 'pdf';
    if (!isPdf) return null;

    const parser = new PDFParse({ data: file.buffer });
    try {
      // Sequenziali, non Promise.all: due chiamate concorrenti sulla stessa
      // istanza di PDFParse si sono rivelate instabili (DataCloneError interno
      // al worker fittizio di pdf.js).
      const textResult = (await parser.getText()) as { pages: { num: number; text: string }[] };
      const infoResult = (await parser.getInfo({ parsePageInfo: true })) as {
        pages: { pageNumber: number; width: number; height: number }[];
      };

      const sourcePages = textResult.pages;
      if (sourcePages.length === 0 || sourcePages.every((p) => !p.text.trim())) return null;

      const dimsByPage = new Map(infoResult.pages.map((p) => [p.pageNumber, { width: p.width, height: p.height }]));
      const truncated = sourcePages.length > this.MAX_CHUNKS;
      const pagesToTranslate = sourcePages.slice(0, this.MAX_CHUNKS);

      const translatedPages: { text: string; width?: number; height?: number }[] = [];
      for (const p of pagesToTranslate) {
        const source = p.text.trim();
        const translated = source ? (await this.translateChunk(source, targetLanguage)).trim() : '';
        translatedPages.push({ text: translated, ...dimsByPage.get(p.num) });
      }

      const buffer = await this.dataConverter.pagedTextToPdf(translatedPages);
      return {
        pdfBase64: buffer.toString('base64'),
        translatedText: translatedPages.map((p) => p.text).filter(Boolean).join('\n\n'),
        pageCount: pagesToTranslate.length,
        truncated,
      };
    } catch (err) {
      this.logger.warn(`High Fidelity layout skipped, falling back to Standard: ${(err as Error).message}`);
      return null;
    } finally {
      await parser.destroy();
    }
  }

  /**
   * Traduce l'intero documento, non solo i primi ~10000 caratteri. Un testo
   * che entra in un blocco solo fa la stessa unica chiamata di prima; uno
   * più lungo viene tradotto blocco per blocco e concatenato — la traduzione,
   * come la formattazione, è locale e non richiede un passo di reduce.
   *
   * Restituisce anche un vero PDF tradotto (pdfBase64), non solo testo: il
   * frontend aveva già l'interfaccia pronta per mostrarlo e scaricarlo.
   */
  async translatePdf(file: Express.Multer.File, targetLanguage: string, highFidelity: boolean) {
    const start = Date.now();
    const { text: originalText, pageCount, isScanned } = await this.extractTextWithOcrFallback(file);
    if (!originalText.trim()) {
      throw new BadRequestException(
        'Could not extract text from file. If this is a scanned document, the OCR pass found no readable text either.',
      );
    }

    // Le pagine scansionate non hanno un text layer con posizioni: la modalità
    // pagina-per-pagina ha senso solo quando il PDF ha già del testo nativo.
    const paged = highFidelity && !isScanned ? await this.tryBuildPagedTranslatedPdf(file, targetLanguage) : null;

    let pdfBase64: string | null;
    let translatedText: string;
    let blocksTranslated: number;
    let truncated: boolean;

    if (paged) {
      pdfBase64 = paged.pdfBase64;
      translatedText = paged.translatedText;
      blocksTranslated = paged.pageCount;
      truncated = paged.truncated;
    } else {
      const allChunks = chunkText(originalText, AiService.TRANSLATE_CHUNK_CHARS);
      const chunks = allChunks.slice(0, this.MAX_CHUNKS);
      truncated = allChunks.length > this.MAX_CHUNKS;

      const translatedParts: string[] = [];
      for (const chunk of chunks) {
        translatedParts.push((await this.translateChunk(chunk, targetLanguage)).trim());
      }
      translatedText = translatedParts.join('\n\n');
      pdfBase64 = await this.tryBuildTranslatedPdf(translatedText);
      blocksTranslated = (originalText.match(/\n\n/g) || []).length + 1;
    }

    const wordCount = originalText.trim().split(/\s+/).filter(Boolean).length;

    return {
      jobId: randomUUID(),
      targetLanguage,
      pdfBase64,
      translatedText,
      originalText,
      // true solo quando la modalità pagina-per-pagina è riuscita: vedi tryBuildPagedTranslatedPdf.
      layoutPreserved: paged !== null,
      // true solo quando il PDF non si è potuto generare (script non latino) o
      // il documento supera il tetto di sicurezza sui blocchi/pagine: in
      // entrambi i casi resta comunque disponibile il testo tradotto per intero.
      fallback: pdfBase64 === null,
      wordCount,
      pageCount,
      processingTime: Date.now() - start,
      isScanned,
      blocksTranslated,
      truncated,
    };
  }
}
