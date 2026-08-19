import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ChatSession, ChatSessionDocument, ChatMessage } from './schemas/chat-session.schema';
import { MailService } from '../mail/mail.service';
import { AboutService } from '../about/about.service';
import { AboutDocument } from '../about/schemas/about.schema';
import { AiProviderService } from '../common/services/ai-provider.service';

const LANG_NAMES: Record<string, string> = {
  it: 'Italian (Italiano)',
  en: 'English',
  sq: 'Albanian (Shqip)',
  es: 'Spanish (Español)',
  pt: 'Portuguese (Português)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
};

function buildSystemPrompt(lang?: string, about?: Partial<AboutDocument> | null): string {
  const uiLangHint = lang && LANG_NAMES[lang]
    ? `The visitor's interface language is set to ${LANG_NAMES[lang]} (code: ${lang}) — use this only as a fallback guess when the message itself gives no clear signal about the language.`
    : '';

  const aboutLines = [
    about?.headline && `Headline: ${about.headline}`,
    about?.bio && `Bio: ${about.bio}`,
    about?.location && `Location: ${about.location}`,
    about?.skills?.length && `Skills: ${about.skills.join(', ')}`,
  ].filter(Boolean);

  const aboutBlock = aboutLines.length
    ? `\nHere is real, up-to-date information about Gent — use it to answer questions about him accurately:\n${aboutLines.join('\n')}\n`
    : '';

  return `You are an AI assistant embedded in Gent Sallaku's developer portfolio website.
Gent Sallaku is a full-stack developer specialized in Angular, Javascript, NestJS, MongoDB, and modern web technologies.
He built this portfolio to showcase his projects, experiences, and services.
${aboutBlock}
Gent also built a suite of free tools available on this site, under the "🧰 AI & Tools" menu (base path /lab/...). If a visitor asks about tools, document processing, PDFs, or productivity utilities, proactively mention the relevant ones and give their exact path.

AI-powered tools:
- AI Document Summarizer (/lab/pdf-summary): upload a PDF, Word, or TXT file and get an AI-generated summary in seconds.
- AI Formatter (/lab/ai-formatter): turns raw, unformatted notes and text into a polished, well-structured document.
- AI PDF Translator (/lab/pdf-translate): translates any PDF or document into 12 languages with AI quality.
- AI Slides Generator (/lab/ai-ppt): turns any topic into a full presentation with speaker notes.

Other PDF/document utilities (not AI-based):
- PDF Editor (/lab/pdf-editor): merge, split, rotate, delete pages, add watermarks to any PDF.
- Viewer (/lab/viewer): view, navigate, and search inside PDF documents in the browser.
- Editor (/lab/editor): rich text editor with export to PDF and DOCX.
- Converter (/lab/convert): convert between PDF, Word, Excel, images, and more.
- OCR (/lab/ocr): extract text from PDFs and scanned images.
- Scanner (/lab/scanner): scan physical documents with the camera and convert them to PDF.

Your role:
- Answer questions about Gent's skills, projects, and experience
- Help visitors navigate the portfolio (sections: Home, Projects, Blog, Services, Contact) and the AI & Tools suite above
- Act as a general-purpose assistant: answer any other question the visitor asks (programming, general knowledge, advice, casual conversation, anything), even if unrelated to Gent or the portfolio
- Be welcoming, professional, and helpful

Keep responses under 150 words unless asked for more detail.
If you don't know something specific about Gent (not covered above), suggest the visitor contact him at gentsallaku@gmail.com or use the Contact section — but this only applies to questions about Gent himself, not to general questions.

Language rules:
- Always reply in the same language the visitor's latest message is written in — this takes priority over any interface-language setting below.
- ${uiLangHint}
- Pay close attention to correctly recognizing Albanian (Shqip) and never confuse it with similar-sounding Balkan languages (Serbian, Bosnian, Croatian, Macedonian) — if the visitor writes in Albanian, reply in Albanian.
- If you are genuinely unsure which language the visitor is writing in, don't guess: ask them (briefly, in simple neutral wording) which language they'd like to continue in, and reply in that language from then on.`;
}

const FALLBACK_RESPONSES: { pattern: RegExp; response: string }[] = [
  {
    pattern: /^(ciao|hello|hi|hey|salve|buongiorno|buonasera|hej)/i,
    response:
      "Hello! I'm the AI assistant on Gent Sallaku's portfolio. How can I help you today? Feel free to ask about his projects, skills, or anything else!",
  },
  {
    pattern: /project|progetto|lavoro|work|portfolio/i,
    response:
      "Gent has built several full-stack projects using Angular, NestJS, and MongoDB. You can explore them in the **Projects** section of this portfolio! Want to know about a specific project?",
  },
  {
    pattern: /experience|esperienza|skill|competenz|tecnolog|technology|stack/i,
    response:
      "Gent specialises in full-stack web development: **Angular** (frontend), **NestJS** (backend), **MongoDB** (database), and **TypeScript** throughout. He also works with Docker, Railway, and cloud deployments.",
  },
  {
    pattern: /contact|contatt|email|messag|reach/i,
    response:
      "You can contact Gent directly via the **Contact** section on this site, or send him an email at gentsallaku@gmail.com. He usually responds within 24–48 working hours.",
  },
  {
    pattern: /blog|article|articolo|post/i,
    response:
      "Gent writes about web development, Angular, NestJS, and software engineering in the **Blog** section. Check it out for technical insights and tutorials!",
  },
  {
    pattern: /service|servizio|freelance|hire|availab/i,
    response:
      "Gent offers freelance full-stack development services. Visit the **Services** section for details. You can also reach out through the Contact page to discuss your project.",
  },
  {
    pattern: /about|chi è|chi sei|presentati|introduce/i,
    response:
      "Gent Sallaku is a full-stack developer passionate about building modern, performant web applications. This portfolio showcases his work and expertise. Visit the **About** section to learn more!",
  },
];

const DEFAULT_FALLBACK =
  "I'm the AI assistant for this portfolio. I can answer questions about Gent's projects, skills, and services. You're also welcome to use the **Contact** section to get in touch with him directly!";

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatSessionModel: Model<ChatSessionDocument>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly aboutService: AboutService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async sendMessage(
    message: string,
    sessionId?: string,
    meta?: { ip?: string; userAgent?: string },
    lang?: string,
  ): Promise<{ sessionId: string; reply: string; timestamp: Date }> {
    const sid = sessionId && sessionId.length > 0 ? sessionId : randomUUID();

    let session = await this.chatSessionModel.findOne({ sessionId: sid }).exec();
    if (!session) {
      session = new this.chatSessionModel({ sessionId: sid, messages: [] });
    }

    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date() };
    session.messages.push(userMsg);

    const historyForAI = session.messages
      .slice(-20) // last 20 messages for context window
      .map((m) => ({ role: m.role, content: m.content }));

    const reply = await this.callAI(historyForAI, lang);

    const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date() };
    session.messages.push(assistantMsg);
    session.lastActivity = new Date();

    await session.save();

    return { sessionId: sid, reply, timestamp: assistantMsg.timestamp };
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async getTodayInteractionCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    // Count sessions that had activity today by filtering lastActivity >= start
    // or count messages with timestamp >= start across all sessions
    const sessions = await this.chatSessionModel
      .find({ lastActivity: { $gte: start } })
      .exec();
    // Count total user messages across those sessions today
    return sessions.reduce((total, s) => {
      return total + s.messages.filter(m => m.role === 'user' && new Date(m.timestamp) >= start).length;
    }, 0);
  }

  async getTodaySessions(page = 1, limit = 15): Promise<{
    data: Array<{
      sessionId: string;
      messages: ChatMessage[];
      lastActivity: Date;
      createdAt: Date;
      messageCount: number;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const safePage  = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const filter = { lastActivity: { $gte: start } };
    const [sessions, total] = await Promise.all([
      this.chatSessionModel
        .find(filter)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.chatSessionModel.countDocuments(filter).exec(),
    ]);

    return {
      data: (sessions as Array<any>).map(s => ({
        sessionId: s.sessionId,
        messages: s.messages ?? [],
        lastActivity: s.lastActivity,
        createdAt: s.createdAt,
        messageCount: s.messages?.length ?? 0,
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getChatbotStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    interactionsToday: number;
    sessionsThisMonth: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSessions, allSessions, sessionsThisMonth, interactionsToday] = await Promise.all([
      this.chatSessionModel.countDocuments().exec(),
      this.chatSessionModel.find({}, 'messages').lean().exec(),
      this.chatSessionModel.countDocuments({ createdAt: { $gte: startOfMonth } }).exec(),
      this.getTodayInteractionCount(),
    ]);

    const totalMessages = (allSessions as Array<{ messages: unknown[] }>).reduce(
      (sum, s) => sum + (s.messages?.length ?? 0), 0,
    );

    return { totalSessions, totalMessages, interactionsToday, sessionsThisMonth };
  }

  async sendTranscript(sessionId: string, email: string): Promise<{ success: boolean }> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session || session.messages.length === 0) {
      return { success: false };
    }
    const result = await this.mailService.sendChatTranscript(email, session.messages);
    return { success: result.success };
  }

  // Provider attivo: Groq.
  private async callAI(messages: { role: string; content: string }[], lang?: string): Promise<string> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return this.getFallbackResponse(messages[messages.length - 1].content);
    }

    try {
      const about = await this.aboutService.get().catch(() => null);
      const content = await this.aiProvider.chatCompletion(
        [{ role: 'system', content: buildSystemPrompt(lang, about) }, ...messages],
        { model: 'llama-3.1-8b-instant', maxTokens: 350, timeoutMs: 15_000 },
      );
      return content || this.getFallbackResponse(messages[messages.length - 1].content);
    } catch (err) {
      this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
      return this.getFallbackResponse(messages[messages.length - 1].content);
    }
  }

  // Provider alternativo (Gemini) — tenuto per eventuale ripristino futuro.
  // private async callGeminiAI(messages: { role: string; content: string }[], lang?: string): Promise<string> {
  //   const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  //   if (!apiKey) {
  //     return this.getFallbackResponse(messages[messages.length - 1].content);
  //   }
  //
  //   const contents = messages.map((m) => ({
  //     role: m.role === 'assistant' ? 'model' : 'user',
  //     parts: [{ text: m.content }],
  //   }));
  //
  //   try {
  //     const response = await fetch(
  //       `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
  //       {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           system_instruction: { parts: [{ text: buildSystemPrompt(lang) }] },
  //           contents,
  //           generationConfig: { maxOutputTokens: 350, temperature: 0.7 },
  //         }),
  //         signal: AbortSignal.timeout(15_000),
  //       },
  //     );
  //
  //     if (!response.ok) {
  //       const err = await response.text();
  //       this.logger.warn(`Gemini responded with status ${response.status}: ${err}`);
  //       return this.getFallbackResponse(messages[messages.length - 1].content);
  //     }
  //
  //     const data = (await response.json()) as {
  //       candidates?: { content?: { parts?: { text?: string }[] } }[];
  //       usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  //     };
  //     this.logger.log(`Gemini → ${data.usageMetadata?.promptTokenCount ?? '?'} prompt + ${data.usageMetadata?.candidatesTokenCount ?? '?'} completion tokens`);
  //     return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || this.getFallbackResponse(messages[messages.length - 1].content);
  //   } catch (err) {
  //     this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
  //     return this.getFallbackResponse(messages[messages.length - 1].content);
  //   }
  // }

  private getFallbackResponse(userMessage: string): string {
    for (const { pattern, response } of FALLBACK_RESPONSES) {
      if (pattern.test(userMessage)) return response;
    }
    return DEFAULT_FALLBACK;
  }
}
