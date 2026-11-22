import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';
import { AiQuotaService } from './ai-quota.service';

function groqResponse(content: string, promptTokens: number, completionTokens: number, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () =>
      Promise.resolve({
        model: 'openai/gpt-oss-120b',
        choices: [{ message: { content } }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
      }),
    text: () => Promise.resolve('error body'),
  } as Response;
}

describe('AiProviderService', () => {
  let config: { get: jest.Mock };
  let aiQuota: jest.Mocked<Pick<AiQuotaService, 'recordTokens'>>;
  let service: AiProviderService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('fake-groq-key') };
    aiQuota = { recordTokens: jest.fn().mockResolvedValue(undefined) };
    service = new AiProviderService(config as unknown as ConfigService, aiQuota as unknown as AiQuotaService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('registra su AiQuotaService la somma di prompt e completion token della risposta', async () => {
    fetchMock.mockResolvedValue(groqResponse('Ciao!', 120, 45));

    const result = await service.chatCompletion([{ role: 'user', content: 'hey' }], {
      model: 'openai/gpt-oss-120b',
      maxTokens: 100,
      timeoutMs: 5000,
    });

    expect(result).toBe('Ciao!');
    expect(aiQuota.recordTokens).toHaveBeenCalledWith(165, 'tools');
  });

  it('attribuisce i token alla provenienza indicata (chatbot) per la dashboard', async () => {
    fetchMock.mockResolvedValue(groqResponse('Ciao!', 10, 5));

    await service.chatCompletion([{ role: 'user', content: 'hey' }], {
      model: 'openai/gpt-oss-120b',
      maxTokens: 100,
      timeoutMs: 5000,
      source: 'chatbot',
    });

    expect(aiQuota.recordTokens).toHaveBeenCalledWith(15, 'chatbot');
  });

  it('registra 0 quando Groq non riporta usage (nessun crash)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    } as Response);

    await service.chatCompletion([{ role: 'user', content: 'hey' }], {
      model: 'openai/gpt-oss-120b',
      maxTokens: 100,
      timeoutMs: 5000,
    });

    expect(aiQuota.recordTokens).toHaveBeenCalledWith(0, 'tools');
  });

  describe('errori di Groq', () => {
    const opts = { model: 'openai/gpt-oss-120b', maxTokens: 100, timeoutMs: 5000 };
    const call = () => service.chatCompletion([{ role: 'user', content: 'hey' }], opts);
    const withRetryAfter = (status: number, seconds: string) =>
      ({ ...groqResponse('', 0, 0, false, status), headers: new Headers({ 'retry-after': seconds }) }) as Response;
    let wait: jest.SpyInstance;

    beforeEach(() => {
      // niente attese reali nei test
      wait = jest.spyOn(service as unknown as { wait: (ms: number) => Promise<void> }, 'wait').mockResolvedValue(undefined);
    });

    it('su 429 riprova rispettando Retry-After e, se poi va, restituisce la risposta', async () => {
      fetchMock
        .mockResolvedValueOnce(withRetryAfter(429, '3'))
        .mockResolvedValueOnce(groqResponse('Ciao!', 10, 5));

      await expect(call()).resolves.toBe('Ciao!');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(wait).toHaveBeenCalledWith(3000);
    });

    it('se il 429 persiste risponde 429 al client (non 500) e non registra token', async () => {
      fetchMock.mockResolvedValue(groqResponse('', 0, 0, false, 429));

      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(wait.mock.calls.map((c) => c[0])).toEqual([2000, 4000]);
      expect(aiQuota.recordTokens).not.toHaveBeenCalled();
    });

    it('non aspetta se Groq chiede più di 20 secondi (es. limite giornaliero)', async () => {
      fetchMock.mockResolvedValue(withRetryAfter(429, '600'));

      const err = await call().catch((e) => e);
      expect(err.getStatus()).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    });

    it('con maxRetries più alto ritenta più volte prima di arrendersi', async () => {
      fetchMock.mockResolvedValue(withRetryAfter(429, '1'));
      await expect(service.chatCompletion([{ role: 'user', content: 'hey' }], { ...opts, maxRetries: 5 })).rejects.toBeInstanceOf(HttpException);
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('un 5xx persistente diventa 503', async () => {
      fetchMock.mockResolvedValue(groqResponse('', 0, 0, false, 500));

      const err = await call().catch((e) => e);
      expect(err.getStatus()).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(aiQuota.recordTokens).not.toHaveBeenCalled();
    });

    it('un errore di richiesta (400) non si ritenta', async () => {
      fetchMock.mockResolvedValue(groqResponse('', 0, 0, false, 400));

      await expect(call()).rejects.toThrow('Groq API error 400');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    });
  });

  it('lancia se GROQ_API_KEY non è configurata', async () => {
    config.get.mockReturnValue(undefined);

    await expect(
      service.chatCompletion([{ role: 'user', content: 'hey' }], {
        model: 'openai/gpt-oss-120b',
        maxTokens: 100,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('GROQ_API_KEY is not configured');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
