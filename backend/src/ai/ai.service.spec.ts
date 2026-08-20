import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiProviderService } from '../common/services/ai-provider.service';
import { AskPassageDto } from './dto/ask-document.dto';

function passage(overrides: Partial<AskPassageDto> = {}): AskPassageDto {
  return {
    docTitle: 'Divina Commedia',
    page: 7,
    text: 'Nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura.',
    ...overrides,
  };
}

describe('AiService.askDocument', () => {
  let service: AiService;
  let aiProvider: { chatCompletion: jest.Mock };

  beforeEach(() => {
    aiProvider = { chatCompletion: jest.fn() };
    service = new AiService(
      new ConfigService(),
      aiProvider as unknown as AiProviderService,
    );
  });

  function replyWith(json: unknown): void {
    aiProvider.chatCompletion.mockResolvedValue(JSON.stringify(json));
  }

  it('restituisce la risposta del modello con le citazioni risolte su documento e pagina', async () => {
    replyWith({ answer: 'Parla di uno smarrimento.', grounded: true, usedPassages: [1] });

    const result = await service.askDocument('Di cosa parla?', [passage()], 'it');

    expect(result.answer).toBe('Parla di uno smarrimento.');
    expect(result.grounded).toBe(true);
    expect(result.citations).toEqual([{ page: 7, docTitle: 'Divina Commedia' }]);
  });

  it('numera i passaggi nel prompt e ne dichiara documento e pagina', async () => {
    replyWith({ answer: 'ok', usedPassages: [] });

    await service.askDocument(
      'Domanda',
      [passage(), passage({ page: 12, text: 'Secondo brano.' })],
      'it',
    );

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    const userMessage = messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).toContain('[1] (Divina Commedia, pagina 7)');
    expect(userMessage).toContain('[2] (Divina Commedia, pagina 12)');
    expect(userMessage).toContain('Domanda');
  });

  it('scarta le citazioni fuori range invece di puntare a pagine mai fornite', async () => {
    replyWith({ answer: 'ok', grounded: true, usedPassages: [1, 4, 0, -2] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([{ page: 7, docTitle: 'Divina Commedia' }]);
  });

  it('scarta gli indici non interi', async () => {
    replyWith({ answer: 'ok', usedPassages: [1.5, 'due' as unknown as number] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([]);
  });

  it('propaga grounded=false quando il modello dichiara di non aver trovato la risposta', async () => {
    replyWith({ answer: 'Gli estratti non lo dicono.', grounded: false, usedPassages: [] });

    const result = await service.askDocument('Chi ha vinto nel 1998?', [passage()], 'it');

    expect(result.grounded).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it('considera la risposta fondata quando il modello omette il campo', async () => {
    replyWith({ answer: 'Una risposta.' });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.grounded).toBe(true);
  });

  it('regge un usedPassages assente o di tipo sbagliato', async () => {
    replyWith({ answer: 'Una risposta.', usedPassages: 'tutti' });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.citations).toEqual([]);
  });

  it('chiede al modello di rispondere nella lingua richiesta', async () => {
    replyWith({ answer: 'An answer.' });

    await service.askDocument('Question?', [passage()], 'en');

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.find((m) => m.role === 'system')!.content).toContain('English');
  });

  it('ripiega sull italiano per una lingua sconosciuta', async () => {
    replyWith({ answer: 'Una risposta.' });

    await service.askDocument('Domanda', [passage()], 'xx');

    const messages = aiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
    expect(messages.find((m) => m.role === 'system')!.content).toContain('Italian');
  });

  it('estrae il JSON anche quando il modello lo avvolge in testo o markdown', async () => {
    aiProvider.chatCompletion.mockResolvedValue(
      'Ecco il risultato:\n```json\n{"answer":"Risposta pulita","usedPassages":[1]}\n```',
    );

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.answer).toBe('Risposta pulita');
    expect(result.citations).toHaveLength(1);
  });

  it('non lascia answer undefined se il modello lo omette', async () => {
    replyWith({ grounded: true, usedPassages: [] });

    const result = await service.askDocument('Domanda', [passage()], 'it');

    expect(result.answer).toBe('');
  });
});
