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
import { ProjectsService } from '../projects/projects.service';
import { BlogService } from '../blog/blog.service';

interface PromptProject {
  title?: string;
  description?: string;
  technologies?: string[];
}

interface PromptPost {
  title?: string;
  slug?: string;
  excerpt?: string;
}

function buildSystemPrompt(
  about?: Partial<AboutDocument> | null,
  projects?: PromptProject[],
  posts?: PromptPost[],
): string {
  const aboutLines = [
    about?.headline && `Headline: ${about.headline}`,
    about?.bio && `Bio: ${about.bio}`,
    about?.location && `Location: ${about.location}`,
    about?.skills?.length && `Skills: ${about.skills.join(', ')}`,
  ].filter(Boolean);

  const aboutBlock = aboutLines.length
    ? `\nHere is real, up-to-date information about Gent — use it to answer questions about him accurately:\n${aboutLines.join('\n')}\n`
    : '';

  const projectsBlock = projects?.length
    ? `\nGent's real projects (use these exact names/details when asked about his work — don't invent projects):\n${projects
        .slice(0, 12)
        .map((p) => `- ${p.title}: ${p.description}${p.technologies?.length ? ` [${p.technologies.join(', ')}]` : ''}`)
        .join('\n')}\n`
    : '';

  const blogBlock = posts?.length
    ? `\nGent's recent blog posts (mention and link these — path is /blog/<slug> — when relevant to the visitor's question):\n${posts
        .slice(0, 8)
        .map((p) => `- "${p.title}" (/blog/${p.slug})${p.excerpt ? `: ${p.excerpt}` : ''}`)
        .join('\n')}\n`
    : '';

  return `You are an AI assistant embedded in Gent Sallaku's developer portfolio website.
Gent Sallaku is a full-stack developer specialized in Angular, Javascript, NestJS, MongoDB, and modern web technologies.
He built this portfolio to showcase his projects, experiences, and services.
${aboutBlock}${projectsBlock}${blogBlock}
Gent also built a suite of free tools available on this site, under the "🧰 AI & Tools" menu (base path /lab/...). If a visitor asks about tools, document processing, PDFs, or productivity utilities, proactively mention the relevant ones and give their exact path. If the visitor asks specifically how one of these tools works, explain briefly (1-2 short sentences, using the steps below) what they do and don't — don't just repeat the name. Always give this explanation in the visitor's own language (per the language rules below), never only in English, no matter which language they ask in.

AI-powered tools:
- AI Document Summarizer (/lab/pdf-summary): upload a PDF, Word, or TXT file → the AI reads it and returns a short summary in seconds, ready to copy or download.
- AI Formatter (/lab/ai-formatter): paste in raw, unformatted notes or text → the AI restructures it into a polished, well-formatted document (headings, lists, paragraphs).
- AI PDF Translator (/lab/pdf-translate): upload a PDF or document and pick a target language → the AI translates the full content, preserving layout, into any of 12 languages.
- AI Slides Generator (/lab/ai-ppt): type in any topic → the AI generates a full slide deck with structured content and speaker notes, ready to export.

Other PDF/document utilities (not AI-based):
- PDF Editor (/lab/pdf-editor): upload a PDF and merge, split, rotate, delete pages, or add watermarks directly in the browser.
- Viewer (/lab/viewer): open a PDF to view, navigate, and search inside it, no download needed.
- Editor (/lab/editor): a rich text editor in the browser; write or paste content and export it to PDF or DOCX.
- Converter (/lab/convert): upload a file and convert it between PDF, Word, Excel, images, and more.
- OCR (/lab/ocr): upload a scanned PDF or image → it extracts the text inside so you can copy or search it.
- Scanner (/lab/scanner): use your device's camera to scan a physical document and turn it into a PDF.

Your role:
- Answer questions about Gent's skills, projects, and experience
- Help visitors navigate the portfolio (sections: Home, Projects, Blog, Services, Contact) and the AI & Tools suite above
- Act as a general-purpose assistant: answer any other question the visitor asks (programming, general knowledge, advice, casual conversation, anything), even if unrelated to Gent or the portfolio
- Be welcoming, professional, and helpful

Keep responses under 150 words unless asked for more detail.
If you don't know something specific about Gent (not covered above), suggest the visitor contact him at gentsallaku@gmail.com or use the Contact section — but this only applies to questions about Gent himself, not to general questions.

Contact requests (important):
- If the visitor asks how to contact Gent, asks for his email, or wants to get in touch with him, reply with this (translated naturally into the visitor's language): he can be reached by writing to gentsallaku@gmail.com, or by using the Contact section of the site, where there's a quick form to send messages directly — the Contact section also has his phone number, which can be used to call him or write to him on WhatsApp.
- Then, still in the visitor's language, ask whether they'd rather talk to Gent live/in real time right now instead of waiting for an email reply.
- Whenever your reply offers or discusses talking to Gent live/in real time (proactively, or because the visitor asked/agreed), add this exact marker line by itself: LIVE_OFFER: true — this renders a real "talk now" button for the visitor, so include it instead of describing how to start the live chat yourself.
- Do not add the LIVE_OFFER line for any other kind of reply.

Language rules:
- Always reply in the same language the visitor's latest message is written in. Detect the language from the message itself before composing the answer; this takes priority over any interface-language setting below.
- Never reply in English to an Italian message just because the interface language is English.
- Pay close attention to correctly recognizing Albanian (Shqip) and never confuse it with similar-sounding Balkan languages (Serbian, Bosnian, Croatian, Macedonian) — if the visitor writes in Albanian, reply in Albanian.
- If you cannot confidently identify the language, reply in English.
Do not use the website interface language to choose the response language.

Follow-up suggestions (required):
After your reply (and after the LIVE_OFFER line, when present), on its own final line, add exactly:
SUGGESTIONS: question one? | question two? | question three?
- Three short, natural follow-up questions the visitor might ask next, in the same language as your reply, each under 8 words.
- This must be the last line of your output, must not be mentioned anywhere else in the reply, and must always be present.`;
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
      "You can write to Gent directly at gentsallaku@gmail.com, or use the **Contact** section on this site, which has a quick form to send messages directly — you'll also find his phone number there, to call him or write on WhatsApp. Would you rather talk to him live, in real time, right now?",
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
const DEFAULT_ITALIAN_FALLBACK =
  'Sono l’assistente AI di questo portfolio. Posso rispondere a domande sui progetti, sulle competenze e sui servizi di Gent. Puoi anche usare la sezione **Contact** per contattarlo direttamente!';
const DEFAULT_ALBANIAN_FALLBACK =
  'Jam asistenti AI i këtij portofoli. Mund t’u përgjigjem pyetjeve për projektet, aftësitë dhe shërbimet e Gentit. Mund të përdorësh edhe seksionin **Contact** për ta kontaktuar drejtpërdrejt!';
const DEFAULT_LOCALIZED_FALLBACKS: Record<string, string> = {
  it: DEFAULT_ITALIAN_FALLBACK,
  sq: DEFAULT_ALBANIAN_FALLBACK,
  es: 'Soy el asistente de IA de este portfolio. Puedo responder preguntas sobre los proyectos, las habilidades y los servicios de Gent. También puedes usar la sección **Contact** para contactarlo directamente.',
  pt: 'Sou o assistente de IA deste portfólio. Posso responder a perguntas sobre os projetos, as competências e os serviços do Gent. Também podes usar a secção **Contact** para contactá-lo diretamente.',
  fr: "Je suis l'assistant IA de ce portfolio. Je peux répondre aux questions sur les projets, les compétences et les services de Gent. Vous pouvez aussi utiliser la section **Contact** pour le contacter directement.",
  de: 'Ich bin der KI-Assistent dieses Portfolios. Ich kann Fragen zu Gents Projekten, Fähigkeiten und Dienstleistungen beantworten. Du kannst ihn auch direkt über den Bereich **Contact** kontaktieren.',
};

function detectLanguage(message: string): string | undefined {
  if (/\b(dhe|është|eshte|për|çfarë|cfare|shqip|ju lutem|faleminderit|përshëndetje)\b/i.test(message)) {
    return 'sq';
  }
  if (/\b(sono|ciao|grazie|perché|perche|come|posso|vorrei|buongiorno|buonasera|progetto|progetti)\b/i.test(message)) return 'it';
  if (/\b(hola|gracias|cómo|como|puedo|quiero|proyecto|proyectos|buenos)\b/i.test(message)) return 'es';
  if (/\b(olá|obrigado|obrigada|como|posso|quero|projeto|projetos|bom)\b/i.test(message)) return 'pt';
  if (/\b(bonjour|merci|comment|peux|voudrais|projet|projets|salut)\b/i.test(message)) return 'fr';
  if (/\b(hallo|danke|wie|kann|möchte|projekt|projekte|guten)\b/i.test(message)) return 'de';
  return undefined;
}

/** Matches the visitor asking to contact Gent, in any of the site's supported languages — used to offer live chat from the static fallback replies. */
const CONTACT_INTENT_PATTERN =
  /contact|contatt|reach\s+him|reach\s+out|get in touch|kontakt|contacto|contactar|kontaktoj|kontakto/i;

/** Splits the model's raw output into the visible reply and the trailing `LIVE_OFFER:` / `SUGGESTIONS:` marker lines (either order). */
function parseAIReply(raw: string): { content: string; suggestions?: string[]; liveOffer?: boolean } {
  const lines = raw.trim().split('\n');
  let suggestions: string[] | undefined;
  let liveOffer: boolean | undefined;

  while (lines.length) {
    const last = lines[lines.length - 1].trim();

    const suggMatch = last.match(/^SUGGESTIONS:\s*(.+)$/i);
    if (suggMatch) {
      suggestions = suggMatch[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3);
      lines.pop();
      continue;
    }

    const offerMatch = last.match(/^LIVE_OFFER:\s*(true|false)$/i);
    if (offerMatch) {
      liveOffer = offerMatch[1].toLowerCase() === 'true';
      lines.pop();
      continue;
    }

    break;
  }

  const content = lines.join('\n').trim();
  return {
    content: content || raw.trim(),
    suggestions: suggestions?.length ? suggestions : undefined,
    liveOffer,
  };
}

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
    private readonly projectsService: ProjectsService,
    private readonly blogService: BlogService,
  ) {}

  async sendMessage(
    message: string,
    sessionId?: string,
    meta?: { ip?: string; userAgent?: string },
    lang?: string,
  ): Promise<{ sessionId: string; reply: string; timestamp: Date; suggestions?: string[]; liveOffer?: boolean }> {
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

    const { content: reply, suggestions, liveOffer, usedFallback } = await this.callAI(historyForAI);

    const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date(), usedFallback };
    session.messages.push(assistantMsg);
    session.lastActivity = new Date();

    await session.save();

    return { sessionId: sid, reply, timestamp: assistantMsg.timestamp, suggestions, liveOffer };
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

  /** Counts assistant replies served today from the static canned fallback (AI call failed/unavailable) — surfaces AI provider outages that would otherwise go unnoticed. */
  async getTodayFallbackCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sessions = await this.chatSessionModel
      .find({ lastActivity: { $gte: start } })
      .exec();
    return sessions.reduce((total, s) => {
      return total + s.messages.filter(
        m => m.role === 'assistant' && m.usedFallback && new Date(m.timestamp) >= start,
      ).length;
    }, 0);
  }

  async getChatbotStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    interactionsToday: number;
    sessionsThisMonth: number;
    fallbackRepliesToday: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSessions, allSessions, sessionsThisMonth, interactionsToday, fallbackRepliesToday] = await Promise.all([
      this.chatSessionModel.countDocuments().exec(),
      this.chatSessionModel.find({}, 'messages').lean().exec(),
      this.chatSessionModel.countDocuments({ createdAt: { $gte: startOfMonth } }).exec(),
      this.getTodayInteractionCount(),
      this.getTodayFallbackCount(),
    ]);

    const totalMessages = (allSessions as Array<{ messages: unknown[] }>).reduce(
      (sum, s) => sum + (s.messages?.length ?? 0), 0,
    );

    return { totalSessions, totalMessages, interactionsToday, sessionsThisMonth, fallbackRepliesToday };
  }

  /** Appends a message written live (visitor or Gent) once a live handoff session is active */
  async appendLiveMessage(
    sessionId: string,
    role: 'user' | 'agent',
    content: string,
  ): Promise<ChatMessage> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session) throw new NotFoundException('Session not found');

    const message: ChatMessage = { role, content, timestamp: new Date() };
    session.messages.push(message);
    session.lastActivity = new Date();
    await session.save();
    return message;
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
  private async callAI(
    messages: { role: string; content: string }[],
  ): Promise<{ content: string; suggestions?: string[]; liveOffer?: boolean; usedFallback: boolean }> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return { ...this.getFallbackResponse(messages[messages.length - 1].content), usedFallback: true };
    }

    try {
      const [about, projects, postsPage] = await Promise.all([
        this.aboutService.get().catch(() => null),
        this.projectsService.findAll().catch(() => []) as Promise<PromptProject[]>,
        this.blogService.findPublished(undefined, 1, 8).catch(() => ({ data: [] as PromptPost[] })),
      ]);
      const raw = await this.aiProvider.chatCompletion(
        [{ role: 'system', content: buildSystemPrompt(about, projects, postsPage.data) }, ...messages],
        { model: 'openai/gpt-oss-120b', maxTokens: 900, timeoutMs: 20_000 },
      );
      if (!raw) return { ...this.getFallbackResponse(messages[messages.length - 1].content), usedFallback: true };
      return { ...parseAIReply(raw), usedFallback: false };
    } catch (err) {
      this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
      return { ...this.getFallbackResponse(messages[messages.length - 1].content), usedFallback: true };
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

  private getFallbackResponse(userMessage: string): { content: string; liveOffer?: boolean } {
    const liveOffer = CONTACT_INTENT_PATTERN.test(userMessage) || undefined;

    const language = detectLanguage(userMessage);
    if (language && DEFAULT_LOCALIZED_FALLBACKS[language]) {
      return { content: DEFAULT_LOCALIZED_FALLBACKS[language], liveOffer };
    }

    for (const { pattern, response } of FALLBACK_RESPONSES) {
      if (pattern.test(userMessage)) return { content: response, liveOffer };
    }
    return { content: DEFAULT_FALLBACK, liveOffer };
  }
}
