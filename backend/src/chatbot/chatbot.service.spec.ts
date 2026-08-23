import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ChatbotService } from './chatbot.service';
import { ChatSession } from './schemas/chat-session.schema';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { AboutService } from '../about/about.service';
import { AiProviderService } from '../common/services/ai-provider.service';
import { ProjectsService } from '../projects/projects.service';
import { BlogService } from '../blog/blog.service';

describe('ChatbotService', () => {
  let service: ChatbotService;
  let mockModel: any;
  let mockMailService: any;
  let mockConfig: any;
  let mockAboutService: any;
  let mockAiProvider: any;
  let mockProjectsService: any;
  let mockBlogService: any;

  function fakeSession(overrides: Partial<{ sessionId: string; messages: any[] }> = {}) {
    return {
      sessionId: overrides.sessionId ?? 'existing-session',
      messages: overrides.messages ?? [],
      lastActivity: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    };
  }

  beforeEach(async () => {
    mockModel = jest.fn().mockImplementation((data: any) => ({
      ...data,
      messages: data?.messages ?? [],
      save: jest.fn().mockResolvedValue(undefined),
    }));
    mockModel.findOne = jest.fn();
    mockModel.find = jest.fn();
    mockModel.countDocuments = jest.fn();

    mockMailService = { sendChatTranscript: jest.fn() };
    mockConfig = { get: jest.fn().mockReturnValue('fake-groq-key') };
    mockAboutService = { get: jest.fn().mockResolvedValue(null) };
    mockAiProvider = { chatCompletion: jest.fn() };
    mockProjectsService = { findAll: jest.fn().mockResolvedValue([]) };
    mockBlogService = { findPublished: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatbotService,
        { provide: getModelToken(ChatSession.name), useValue: mockModel },
        { provide: MailService, useValue: mockMailService },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AboutService, useValue: mockAboutService },
        { provide: AiProviderService, useValue: mockAiProvider },
        { provide: ProjectsService, useValue: mockProjectsService },
        { provide: BlogService, useValue: mockBlogService },
      ],
    }).compile();

    service = module.get<ChatbotService>(ChatbotService);
  });

  describe('sendMessage — percorso AI riuscito', () => {
    beforeEach(() => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    });

    it('passa progetti e articoli reali nel system prompt (RAG)', async () => {
      mockProjectsService.findAll.mockResolvedValue([
        { title: 'Portfolio AI', description: 'Sito con chatbot AI', technologies: ['Angular', 'NestJS'] },
      ]);
      mockBlogService.findPublished.mockResolvedValue({
        data: [{ title: 'Come funziona il RAG', slug: 'come-funziona-rag', excerpt: 'Una guida.' }],
        total: 1, page: 1, totalPages: 1,
      });
      mockAiProvider.chatCompletion.mockResolvedValue('Risposta.\nSUGGESTIONS: Domanda uno? | Domanda due?');

      await service.sendMessage('Che progetti hai fatto?');

      const messages = mockAiProvider.chatCompletion.mock.calls[0][0] as { role: string; content: string }[];
      const systemPrompt = messages.find((m) => m.role === 'system')!.content;
      expect(systemPrompt).toContain('Portfolio AI');
      expect(systemPrompt).toContain('Angular, NestJS');
      expect(systemPrompt).toContain('/blog/come-funziona-rag');
    });

    it('estrae le suggestions dalla riga finale e le rimuove dal testo mostrato', async () => {
      mockAiProvider.chatCompletion.mockResolvedValue(
        'Ciao! Come posso aiutarti?\nSUGGESTIONS: Chi è Gent? | Che progetti ha fatto? | Come lo contatto?',
      );

      const result = await service.sendMessage('ciao');

      expect(result.reply).toBe('Ciao! Come posso aiutarti?');
      expect(result.reply).not.toContain('SUGGESTIONS');
      expect(result.suggestions).toEqual(['Chi è Gent?', 'Che progetti ha fatto?', 'Come lo contatto?']);
    });

    it('non taglia la risposta quando il modello non include la riga SUGGESTIONS', async () => {
      mockAiProvider.chatCompletion.mockResolvedValue('Una risposta senza suggerimenti.');

      const result = await service.sendMessage('domanda');

      expect(result.reply).toBe('Una risposta senza suggerimenti.');
      expect(result.suggestions).toBeUndefined();
    });

    it('salva il messaggio assistant con usedFallback=false', async () => {
      mockAiProvider.chatCompletion.mockResolvedValue('Risposta ok.\nSUGGESTIONS: a? | b?');

      await service.sendMessage('domanda');

      const savedSession = mockModel.mock.results[0].value;
      const assistantMsg = savedSession.messages.find((m: any) => m.role === 'assistant');
      expect(assistantMsg.usedFallback).toBe(false);
    });
  });

  describe('sendMessage — percorso di fallback', () => {
    beforeEach(() => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    });

    it('usa il fallback statico quando GROQ_API_KEY non è configurata, senza suggestions', async () => {
      mockConfig.get.mockReturnValue(undefined);

      const result = await service.sendMessage('ciao');

      expect(mockAiProvider.chatCompletion).not.toHaveBeenCalled();
      expect(result.suggestions).toBeUndefined();
      const savedSession = mockModel.mock.results[0].value;
      expect(savedSession.messages.find((m: any) => m.role === 'assistant').usedFallback).toBe(true);
    });

    it('usa il fallback quando la chiamata AI fallisce, e riconosce "Ciao!" con punteggiatura come italiano', async () => {
      mockAiProvider.chatCompletion.mockRejectedValue(new Error('Groq 404: model_not_found'));

      const result = await service.sendMessage('Ciao!');

      expect(result.reply).toContain('assistente AI di questo portfolio');
    });

    it('ripiega sull inglese quando la lingua del messaggio di fallback non è riconosciuta', async () => {
      mockAiProvider.chatCompletion.mockRejectedValue(new Error('boom'));

      const result = await service.sendMessage('xyzabc123');

      expect(result.reply).toContain("I'm the AI assistant");
    });
  });

  describe('getChatbotStats', () => {
    it('conta le risposte in fallback di oggi separatamente dalle altre interazioni', async () => {
      const now = new Date();
      const todaySession = {
        messages: [
          { role: 'user', content: 'ciao', timestamp: now },
          { role: 'assistant', content: 'risposta AI', timestamp: now, usedFallback: false },
          { role: 'user', content: 'altra domanda', timestamp: now },
          { role: 'assistant', content: 'risposta di riserva', timestamp: now, usedFallback: true },
        ],
      };

      mockModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([todaySession]),
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([todaySession]) }),
      });
      mockModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const stats = await service.getChatbotStats();

      expect(stats.fallbackRepliesToday).toBe(1);
    });
  });
});
