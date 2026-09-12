import { HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiQuotaService } from '../common/services/ai-quota.service';

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    ip: '203.0.113.7',
    headers: {},
    socket: { remoteAddress: undefined },
    ...overrides,
  } as unknown as Request;
}

describe('AiController — quota giornaliera AI', () => {
  let controller: AiController;
  let aiService: jest.Mocked<
    Pick<AiService, 'summarizeFile' | 'askDocument' | 'formatText' | 'generatePpt' | 'translatePdf'>
  >;
  let aiQuota: jest.Mocked<Pick<AiQuotaService, 'assertWithinBudget'>>;

  const pdfFile = { originalname: 'x.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('x') } as Express.Multer.File;

  beforeEach(() => {
    aiService = {
      summarizeFile: jest.fn().mockResolvedValue({ summary: 'ok' }),
      askDocument: jest.fn().mockResolvedValue({ answer: 'ok' }),
      formatText: jest.fn().mockResolvedValue({ formatted: 'ok' }),
      generatePpt: jest.fn().mockResolvedValue(Buffer.from('ppt')),
      translatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    aiQuota = { assertWithinBudget: jest.fn().mockResolvedValue(undefined) };
    controller = new AiController(aiService as unknown as AiService, aiQuota as unknown as AiQuotaService);
  });

  it('summarize-file: verifica il budget con l’IP del chiamante prima di chiamare il servizio', async () => {
    await controller.summarizeFile(fakeRequest({ ip: '198.51.100.9' }), pdfFile, 'it', 'short');

    expect(aiQuota.assertWithinBudget).toHaveBeenCalledWith('198.51.100.9');
    expect(aiService.summarizeFile).toHaveBeenCalled();
  });

  it('summarize-file: se il budget è esaurito, non chiama il servizio AI', async () => {
    aiQuota.assertWithinBudget.mockRejectedValue(new HttpException('no budget', HttpStatus.SERVICE_UNAVAILABLE));

    await expect(controller.summarizeFile(fakeRequest(), pdfFile, 'it', 'short')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(aiService.summarizeFile).not.toHaveBeenCalled();
  });

  it('ask-document: verifica il budget prima di chiamare il servizio', async () => {
    aiQuota.assertWithinBudget.mockRejectedValue(new HttpException('rate limited', HttpStatus.TOO_MANY_REQUESTS));

    await expect(
      controller.askDocument(fakeRequest(), { question: 'Di cosa parla?', passages: [{ docTitle: 'D', page: 1, text: 'T' }] }),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(aiService.askDocument).not.toHaveBeenCalled();
  });

  it('format-text: valida il testo prima di consumare budget, ma verifica il budget prima di chiamare il servizio', async () => {
    await expect(controller.formatText(fakeRequest(), { text: 'troppo corto' })).resolves.toBeDefined();
    expect(aiQuota.assertWithinBudget).toHaveBeenCalled();

    aiQuota.assertWithinBudget.mockClear();
    aiService.formatText.mockClear();
    await expect(controller.formatText(fakeRequest(), { text: 'x' })).rejects.toThrow('text must be at least 10 characters');
    expect(aiQuota.assertWithinBudget).not.toHaveBeenCalled();
    expect(aiService.formatText).not.toHaveBeenCalled();
  });

  it('generate-ppt: verifica il budget dopo la validazione dell’input, prima di generare', async () => {
    aiQuota.assertWithinBudget.mockRejectedValue(new HttpException('no budget', HttpStatus.SERVICE_UNAVAILABLE));

    await expect(controller.generatePpt(fakeRequest(), 'Un topic valido', '10', 'modern')).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    expect(aiService.generatePpt).not.toHaveBeenCalled();
  });

  it('translate-pdf: verifica il budget con l’IP del chiamante prima di tradurre', async () => {
    await controller.translatePdf(fakeRequest({ ip: '10.0.0.5' }), pdfFile, 'italian', 'true');

    expect(aiQuota.assertWithinBudget).toHaveBeenCalledWith('10.0.0.5');
    expect(aiService.translatePdf).toHaveBeenCalled();
  });

  it('usa X-Forwarded-For come fallback quando req.ip non è disponibile (dietro proxy)', async () => {
    await controller.summarizeFile(
      fakeRequest({ ip: undefined, headers: { 'x-forwarded-for': '203.0.113.99, 10.0.0.1' } }),
      pdfFile,
      'it',
      'short',
    );

    expect(aiQuota.assertWithinBudget).toHaveBeenCalledWith('203.0.113.99');
  });
});
