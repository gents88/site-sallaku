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
    expect(aiQuota.recordTokens).toHaveBeenCalledWith(165);
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

    expect(aiQuota.recordTokens).toHaveBeenCalledWith(0);
  });

  it('non registra token e propaga l’errore quando Groq risponde con un errore HTTP', async () => {
    fetchMock.mockResolvedValue(groqResponse('', 0, 0, false, 500));

    await expect(
      service.chatCompletion([{ role: 'user', content: 'hey' }], {
        model: 'openai/gpt-oss-120b',
        maxTokens: 100,
        timeoutMs: 5000,
      }),
    ).rejects.toThrow('Groq API error 500');

    expect(aiQuota.recordTokens).not.toHaveBeenCalled();
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
