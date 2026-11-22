import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ChatbotService } from './chatbot.service';
import { ChatSession } from './schemas/chat-session.schema';
import { MailService } from '../mail/mail.service';
import { AboutService } from '../about/about.service';
import { AiProviderService } from '../common/services/ai-provider.service';
import { ProjectsService } from '../projects/projects.service';
import { BlogService } from '../blog/blog.service';

describe('ChatbotService — streaming, ricerca e risposte nelle lingue del sito', () => {
  let service: ChatbotService;
  let model: any;
  let config: { get: jest.Mock };
  let ai: { chatCompletion: jest.Mock; chatCompletionStream: jest.Mock };
  let blog: { findPublished: jest.Mock };

  beforeEach(async () => {
    model = jest.fn().mockImplementation((data: any) => ({ ...data, messages: data?.messages ?? [], save: jest.fn().mockResolvedValue(undefined) }));
    model.findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    config = { get: jest.fn().mockReturnValue('key') };
    ai = { chatCompletion: jest.fn(), chatCompletionStream: jest.fn() };
    blog = { findPublished: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: getModelToken(ChatSession.name), useValue: model },
        { provide: MailService, useValue: {} },
        { provide: ConfigService, useValue: config },
        { provide: AboutService, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: AiProviderService, useValue: ai },
        { provide: ProjectsService, useValue: { findAll: jest.fn().mockResolvedValue([]) } },
        { provide: BlogService, useValue: blog },
      ],
    }).compile();
    service = module.get(ChatbotService);
  });

  /** Fa arrivare il testo al servizio a pezzi, come farebbe Groq. */
  const streamOf = (...pieces: string[]) => async (_m: unknown, _o: unknown, onDelta: (t: string) => void) => {
    pieces.forEach((p) => onDelta(p));
    return pieces.join('').trim();
  };

  describe('sendMessageStream', () => {
    it('invia il testo man mano senza mai mostrare le righe di servizio, e restituisce il risultato pulito', async () => {
      ai.chatCompletionStream.mockImplementation(streamOf('Usa ', 'Comprimi PDF.\nLIVE_', 'OFFER: true\nSUGGEST', 'IONS: a? | b? | c?'));
      const shown: string[] = [];

      const result = await service.sendMessageStream('come riduco un pdf?', undefined, undefined, 'it', (t) => shown.push(t));

      const visible = shown.join('');
      expect(visible).toBe('Usa Comprimi PDF.\n');
      expect(visible).not.toMatch(/LIVE|SUGGEST/);
      expect(result.reply).toBe('Usa Comprimi PDF.');
      expect(result.liveOffer).toBe(true);
      expect(result.suggestions).toEqual(['a?', 'b?', 'c?']);
      const saved = model.mock.results[0].value;
      expect(saved.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
      expect(saved.messages[1].usedFallback).toBe(false);
    });

    it('senza chiave AI risponde subito con la risposta predefinita, senza chiamare il modello', async () => {
      config.get.mockReturnValue(undefined);
      const shown: string[] = [];

      const result = await service.sendMessageStream('ciao', undefined, undefined, 'it', (t) => shown.push(t));

      expect(ai.chatCompletionStream).not.toHaveBeenCalled();
      expect(shown).toEqual([]);
      expect(result.reply).toContain("assistente AI di questo portfolio");
    });

    it('se lo stream fallisce prima di mostrare qualcosa ripiega sulla risposta predefinita', async () => {
      ai.chatCompletionStream.mockRejectedValue(new Error('boom'));

      const result = await service.sendMessageStream('ciao', undefined, undefined, 'it', () => undefined);

      expect(result.reply).toContain('assistente AI');
      expect(model.mock.results[0].value.messages[1].usedFallback).toBe(true);
    });

    it('se lo stream si interrompe a metà tiene il testo già mostrato invece di cancellarlo', async () => {
      ai.chatCompletionStream.mockImplementation(async (_m: unknown, _o: unknown, onDelta: (t: string) => void) => {
        onDelta('Per ridurre un PDF apri lo strumento e scegli il livello');
        throw new Error('connessione persa');
      });

      const result = await service.sendMessageStream('come riduco un pdf?', undefined, undefined, 'it', () => undefined);

      expect(result.reply).toBe('Per ridurre un PDF apri lo strumento e scegli il livello');
      expect(model.mock.results[0].value.messages[1].usedFallback).toBe(false);
    });
  });

  describe('prompt', () => {
    const promptOf = (call: any[][]) => (call[0][0] as { role: string; content: string }[]).find((m) => m.role === 'system')!.content;

    it('contiene tutti gli strumenti, anche i nuovi, senza elenco scritto a mano', async () => {
      ai.chatCompletion.mockResolvedValue('ok');
      await service.sendMessage('ciao');
      const prompt = promptOf(ai.chatCompletion.mock.calls);
      for (const p of ['/lab/sign-pdf', '/lab/compress-pdf', '/lab/image-tools', '/lab/qr-code', '/lab/pdf-search']) expect(prompt).toContain(`(${p})`);
    });

    it('porta in primo piano la scorciatoia giusta e un articolo pertinente anche se non è fra i più recenti', async () => {
      const posts = Array.from({ length: 40 }, (_, i) => ({ title: `Articolo ${i}`, slug: `a-${i}`, excerpt: 'testo' }));
      posts.push({ title: 'Come condividere il Wi-Fi con un QR code', slug: 'come-condividere-wifi', excerpt: 'guida' });
      blog.findPublished.mockImplementation((_t: unknown, page: number) =>
        Promise.resolve({ data: page === 1 ? posts.slice(0, 30) : posts.slice(30), total: 41, page, totalPages: 2 }),
      );
      ai.chatCompletion.mockResolvedValue('ok');

      await service.sendMessage('voglio un qr code per il wifi di casa');

      const prompt = promptOf(ai.chatCompletion.mock.calls);
      expect(prompt).toMatch(/\(\/lab\/wifi-qr-code\) — preset of \/lab\/qr-code/);
      expect(prompt).toContain('/blog/come-condividere-wifi');
    });

    it('dichiara che Gent è albanese (di Blinisht, Lezhë) e vive in Italia, e vieta di dirlo italiano', async () => {
      ai.chatCompletion.mockResolvedValue('ok');
      await service.sendMessage('di dove è Gent?');
      const prompt = promptOf(ai.chatCompletion.mock.calls);
      expect(prompt).toContain('Gent is Albanian, originally from Blinisht');
      expect(prompt).toContain('Lezhë');
      expect(prompt).toContain('lives in Italy');
      expect(prompt).toContain('He is NOT Italian');
    });

    it('legge gli articoli una volta sola per 10 minuti (non a ogni messaggio)', async () => {
      ai.chatCompletion.mockResolvedValue('ok');
      await service.sendMessage('uno');
      await service.sendMessage('due');
      expect(blog.findPublished).toHaveBeenCalledTimes(1);
    });
  });

  describe('risposte predefinite nelle lingue del sito', () => {
    beforeEach(() => config.get.mockReturnValue(undefined));
    const reply = async (msg: string, lang?: string) => (await service.sendMessage(msg, undefined, undefined, lang)).reply;

    it('rispondono per argomento nella lingua del messaggio', async () => {
      expect(await reply('Cuéntame sobre tus proyectos')).toContain('**Proyectos**');
      expect(await reply('Quali strumenti avete per i PDF?')).toContain('**AI & Tools**');
      expect(await reply('Où puis-je lire ton blog ?')).toContain('**Blog**');
    });

    it('una richiesta di lavoro in italiano è una domanda sulla disponibilità, non sui progetti', async () => {
      const text = await reply('sei disponibile per un lavoro freelance?');
      expect(text).toContain('lavora come dipendente');
      expect(text).not.toMatch(/disponibile per|realizzato diversi progetti/i);
    });

    it("se la lingua del messaggio non si riconosce usa quella dell'interfaccia", async () => {
      expect(await reply('projects?', 'de')).toContain('**Projekte**');
      expect(await reply('projects?', 'pt-BR')).toContain('**Projetos**');
    });

    it('i contatti rimandano alla sezione Contatti e non ripetono indirizzi nelle altre lingue', async () => {
      for (const lang of ['it', 'es', 'pt', 'fr', 'de', 'sq']) {
        const text = await reply('contatto?', lang);
        expect(text).not.toContain('@');
      }
      expect(await reply('How can I contact Gent?')).toContain('**Contact**');
    });

    it('in inglese e per lingue sconosciute resta il comportamento di prima', async () => {
      expect(await reply('xyzabc123')).toContain("I'm the AI assistant");
      expect(await reply('can I hire you?')).toContain('works as an employee');
    });
  });
});
