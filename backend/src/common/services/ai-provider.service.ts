import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiQuotaService } from './ai-quota.service';
import { AiTokenSource } from './ai-usage.service';

export interface AiChatMessage {
  role: string;
  content: string;
}

export interface AiChatOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  /** Per la dashboard: token degli strumenti /ai/* o del chatbot. Default 'tools'. */
  source?: AiTokenSource;
}

/**
 * Thin shared wrapper around the Groq chat-completions endpoint. Callers
 * keep their own error-handling strategy (ai.service.ts rethrows so the
 * caller sees a hard failure; chatbot.service.ts wraps this in try/catch
 * and falls back to a canned response) — this service only owns the parts
 * that were byte-for-byte identical between the two: the endpoint, headers,
 * request shape, and response parsing.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiQuota: AiQuotaService,
  ) {}

  async chatCompletion(messages: AiChatMessage[], opts: AiChatOptions): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const body = JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    });

    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      if (res.ok) break;

      const text = await res.text();
      const transient = res.status === 429 || res.status >= 500;
      const waitMs = transient ? retryDelayMs(res, attempt) : null;
      if (waitMs !== null && attempt < MAX_RETRIES) {
        this.logger.warn(`Groq ${res.status}, nuovo tentativo tra ${waitMs} ms (${attempt + 1}/${MAX_RETRIES})`);
        await this.wait(waitMs);
        continue;
      }
      this.logger.error(`Groq ${res.status}: ${text}`);
      // Un limite di Groq è temporaneo e non è un guasto nostro: al client arriva
      // 429/503 (il frontend mostra "riprova") invece di un 500 generico.
      if (res.status === 429) {
        throw new HttpException('Il servizio di IA è momentaneamente sovraccarico: riprova tra qualche minuto.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (res.status >= 500) {
        throw new HttpException('Il servizio di IA non è disponibile in questo momento: riprova più tardi.', HttpStatus.SERVICE_UNAVAILABLE);
      }
      throw new Error(`Groq API error ${res.status}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    if (data.model) {
      this.logger.log(
        `Groq [${data.model}] → ${data.usage?.prompt_tokens ?? '?'} prompt + ${data.usage?.completion_tokens ?? '?'} completion tokens`,
      );
    }

    const tokensUsed = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0);
    await this.aiQuota.recordTokens(tokensUsed, opts.source ?? 'tools');

    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  /** Separato per poterlo sostituire nei test. */
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const MAX_RETRIES = 2;
/** Oltre questa attesa (es. limite giornaliero di token) non conviene tenere ferma la richiesta. */
const MAX_WAIT_MS = 20_000;

/**
 * Quanto aspettare prima di riprovare: Retry-After di Groq se c'è, altrimenti
 * 2 s, 4 s… null se Groq chiede di aspettare più di MAX_WAIT_MS.
 */
export function retryDelayMs(res: Response, attempt: number): number | null {
  const header = Number(res.headers?.get?.('retry-after'));
  const ms = Number.isFinite(header) && header > 0 ? Math.ceil(header * 1000) : 2000 * 2 ** attempt;
  return ms <= MAX_WAIT_MS ? ms : null;
}
