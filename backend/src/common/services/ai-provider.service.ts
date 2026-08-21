import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AiChatMessage {
  role: string;
  content: string;
}

export interface AiChatOptions {
  model: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
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

  constructor(private readonly config: ConfigService) {}

  async chatCompletion(messages: AiChatMessage[], opts: AiChatOptions): Promise<string> {
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature ?? 0.7,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Groq ${res.status}: ${text}`);
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

    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
