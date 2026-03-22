import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ChatSession, ChatSessionDocument, ChatMessage } from './schemas/chat-session.schema';
import { MailService } from '../mail/mail.service';

const SYSTEM_PROMPT = `You are an AI assistant embedded in Gent Sallaku's developer portfolio website.
Gent Sallaku is a full-stack developer specialized in Angular, NestJS, MongoDB, and modern web technologies.
He built this portfolio to showcase his projects, experiences, and services.

Your role:
- Answer questions about Gent's skills, projects, and experience
- Help visitors navigate the portfolio (sections: Home, Projects, Blog, Services, Contact)
- Answer general programming questions concisely
- Be welcoming, professional, and helpful

Keep responses under 150 words unless asked for more detail.
If you don't know something specific about Gent, suggest the visitor contact him at gentsallaku@gmail.com or use the Contact section.
Always respond in the same language the user writes in.`;

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
  ) {}

  async sendMessage(
    message: string,
    sessionId?: string,
    meta?: { ip?: string; userAgent?: string },
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

    const reply = await this.callAI(historyForAI);

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

  async sendTranscript(sessionId: string, email: string): Promise<{ success: boolean }> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session || session.messages.length === 0) {
      return { success: false };
    }
    const result = await this.mailService.sendChatTranscript(email, session.messages);
    return { success: result.success };
  }

  private async callAI(messages: { role: string; content: string }[]): Promise<string> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      return this.getFallbackResponse(messages[messages.length - 1].content);
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 350,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.warn(`Groq responded with status ${response.status}: ${err}`);
        return this.getFallbackResponse(messages[messages.length - 1].content);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
        model: string;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      this.logger.log(`Groq [${data.model}] → ${data.usage?.prompt_tokens ?? '?'} prompt + ${data.usage?.completion_tokens ?? '?'} completion tokens`);
      return data.choices?.[0]?.message?.content?.trim() || this.getFallbackResponse(messages[messages.length - 1].content);
    } catch (err) {
      this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
      return this.getFallbackResponse(messages[messages.length - 1].content);
    }
  }

  private getFallbackResponse(userMessage: string): string {
    for (const { pattern, response } of FALLBACK_RESPONSES) {
      if (pattern.test(userMessage)) return response;
    }
    return DEFAULT_FALLBACK;
  }
}
