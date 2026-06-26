import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth');

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly model = 'llama-3.3-70b-versatile';

  constructor(private readonly config: ConfigService) {}

  // ── TEXT EXTRACTION ──────────────────────────────────────────────────

  async extractText(file: Express.Multer.File): Promise<{ text: string; pageCount: number }> {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';

    if (file.mimetype === 'application/pdf' || ext === 'pdf') {
      const data = await pdfParse(file.buffer) as { text: string; numpages: number };
      return { text: data.text, pageCount: data.numpages };
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

  // ── GROQ API ─────────────────────────────────────────────────────────

  private async callGroq(messages: GroqMessage[], maxTokens = 2048): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, max_tokens: maxTokens, temperature: 0.7 }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Groq ${res.status}: ${text}`);
      throw new Error(`Groq API error ${res.status}`);
    }

    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  private parseJson<T>(raw: string): T {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in AI response');
    return JSON.parse(match[0]) as T;
  }

  // ── SUMMARIZE FILE ───────────────────────────────────────────────────

  async summarizeFile(file: Express.Multer.File, lang: string, mode: string) {
    const start = Date.now();
    const { text, pageCount } = await this.extractText(file);
    if (!text.trim()) throw new BadRequestException('Could not extract text from file.');

    const langMap: Record<string, string> = {
      it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
    };
    const responseLang = langMap[lang] || 'English';
    const truncated = text.substring(0, 8000);

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

Document:
${truncated}`,
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
      processingTime: Date.now() - start,
    };
  }

  // ── FORMAT TEXT ──────────────────────────────────────────────────────

  async formatText(text: string, docType: string) {
    const start = Date.now();

    const docDesc: Record<string, string> = {
      general:           'a clean, professional document',
      business_proposal: 'a business proposal (executive summary, problem, solution, pricing, next steps)',
      report:            'a formal report (introduction, findings, analysis, recommendations)',
      meeting_notes:     'structured meeting notes (attendees, agenda, decisions, action items)',
      resume:            'a professional résumé (summary, experience, skills, education)',
      article:           'an article (headline, intro, sections, conclusion)',
    };

    const formatted = await this.callGroq([
      {
        role: 'system',
        content: `You are an expert document formatter. Transform raw text into well-structured Markdown.
Use # for title, ## for sections, ### for subsections, - for bullets, **bold** for emphasis.
Create ${docDesc[docType] || docDesc.general}. Return ONLY the formatted Markdown.`,
      },
      {
        role: 'user',
        content: `Format this text as a ${docType} document:\n\n${text.substring(0, 6000)}`,
      },
    ], 2048);

    const wordCount = formatted.trim().split(/\s+/).filter(Boolean).length;
    const sections = (formatted.match(/^#{1,3} /gm) || []).length;

    const summary = await this.callGroq([
      { role: 'system', content: 'Generate a single sentence summarising what this document is about. Just the sentence, nothing else.' },
      { role: 'user', content: formatted.substring(0, 800) },
    ], 120);

    return { formatted, wordCount, sections, summary: summary.trim(), processingTime: Date.now() - start };
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

  // ── TRANSLATE PDF ────────────────────────────────────────────────────

  async translatePdf(file: Express.Multer.File, targetLanguage: string, highFidelity: boolean) {
    const start = Date.now();
    const { text: originalText, pageCount } = await this.extractText(file);
    if (!originalText.trim()) throw new BadRequestException('Could not extract text from file.');

    const truncated = originalText.substring(0, 10000);

    const translatedText = await this.callGroq([
      {
        role: 'system',
        content: `You are a professional translator. Translate the provided text to ${targetLanguage}.
Preserve paragraph structure and formatting markers. Return ONLY the translated text.`,
      },
      { role: 'user', content: `Translate to ${targetLanguage}:\n\n${truncated}` },
    ], 3000);

    const wordCount = originalText.trim().split(/\s+/).filter(Boolean).length;
    const blocksTranslated = (originalText.match(/\n\n/g) || []).length + 1;

    return {
      jobId: randomUUID(),
      targetLanguage,
      pdfBase64: null,
      translatedText: translatedText.trim(),
      originalText: truncated,
      layoutPreserved: false,
      fallback: true,
      wordCount,
      pageCount,
      processingTime: Date.now() - start,
      isScanned: false,
      blocksTranslated,
    };
  }
}
