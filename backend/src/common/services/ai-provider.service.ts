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
  /** Tentativi in più dopo un 429/5xx (default 2). Chi fa molte chiamate in fila ne vuole di più. */
  maxRetries?: number;
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

  /**
   * POST a Groq con i tentativi in più su 429/5xx (e gli errori già tradotti per il client).
   * Condiviso fra la risposta intera e lo streaming: l'unica differenza è `stream` nel corpo.
   */
  private async postWithRetry(body: string, opts: AiChatOptions, apiKey: string): Promise<Response> {
    const maxRetries = opts.maxRetries ?? MAX_RETRIES;
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
      if (res.ok) return res;

      const text = await res.text();
      const transient = res.status === 429 || res.status >= 500;
      const waitMs = transient ? retryDelayMs(res, attempt) : null;
      if (waitMs !== null && attempt < maxRetries) {
        this.logger.warn(`Groq ${res.status}, nuovo tentativo tra ${waitMs} ms (${attempt + 1}/${maxRetries})`);
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
  }

  async chatCompletion(messages: AiChatMessage[], opts: AiChatOptions): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const body = JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    });

    const res = await this.postWithRetry(body, opts, apiKey);

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

  /**
   * Come chatCompletion, ma la risposta arriva a pezzi: `onDelta` riceve ogni frammento di testo appena
   * il modello lo produce. Restituisce il testo completo. I token consumati si registrano alla fine
   * (se Groq non li comunica nello stream, sono una stima: 1 token ogni 4 caratteri).
   */
  async chatCompletionStream(
    messages: AiChatMessage[],
    opts: AiChatOptions,
    onDelta: (text: string) => void,
  ): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const body = JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    });

    const res = await this.postWithRetry(body, opts, apiKey);
    if (!res.body) throw new Error('Groq stream senza corpo');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let usageTokens: number | null = null;

    const handleLine = (raw: string): void => {
      const line = raw.trim();
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      let json: {
        choices?: { delta?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
      };
      try {
        json = JSON.parse(payload);
      } catch {
        return; // riga spezzata o non JSON: si ignora
      }
      const text = json.choices?.[0]?.delta?.content;
      if (text) {
        full += text;
        onDelta(text);
      }
      const usage = json.usage ?? json.x_groq?.usage;
      if (usage) usageTokens = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    };

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          handleLine(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      handleLine(buffer);
    } finally {
      const used = usageTokens ?? Math.ceil((JSON.stringify(messages).length + full.length) / 4);
      await this.aiQuota.recordTokens(used, opts.source ?? 'tools').catch(() => undefined);
      reader.releaseLock?.();
    }
    return full.trim();
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
