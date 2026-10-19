import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Testimonial } from '../schemas/testimonial.schema';
import { TestimonialsService } from './testimonials.service';
import { SpamDetectionService } from '../../common/services/spam-detection.service';
import { TurnstileService } from '../../common/services/turnstile.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('TestimonialsService', () => {
  let service: TestimonialsService;
  let mockTestimonialModel: any;
  let mockSpamDetectionService: any;
  let mockTurnstileService: any;

  const mockId = new Types.ObjectId();

  const dto = {
    authorName: 'Mario Rossi',
    rating: 5,
    content: 'Ottimo lavoro, davvero consigliato per chiunque cerchi qualità.',
  } as any;

  beforeEach(async () => {
    mockTestimonialModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: mockId,
      save: jest.fn().mockResolvedValue({
        ...data,
        _id: mockId,
        toObject: jest.fn().mockReturnValue({ ...data, _id: mockId }),
      }),
    }));
    mockTestimonialModel.find = jest.fn();
    mockTestimonialModel.findOne = jest.fn();
    mockTestimonialModel.findById = jest.fn();
    mockTestimonialModel.findByIdAndUpdate = jest.fn();
    mockTestimonialModel.findByIdAndDelete = jest.fn();
    mockTestimonialModel.countDocuments = jest.fn();

    mockSpamDetectionService = {
      detectSpam: jest.fn().mockReturnValue({ isSpam: false, score: 5 }),
      sanitizeContent: jest.fn((content) => content),
    };

    mockTurnstileService = {
      verify: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestimonialsService,
        { provide: getModelToken(Testimonial.name), useValue: mockTestimonialModel },
        { provide: SpamDetectionService, useValue: mockSpamDetectionService },
        { provide: TurnstileService, useValue: mockTurnstileService },
      ],
    }).compile();

    service = module.get<TestimonialsService>(TestimonialsService);
  });

  describe('createTestimonial', () => {
    it('always persists new testimonials with isApproved: false', async () => {
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.createTestimonial(dto, '127.0.0.1');

      expect(result).toHaveProperty('id');
      const constructedArg = mockTestimonialModel.mock.calls[0][0];
      expect(constructedArg.isApproved).toBe(false);
      expect(constructedArg.featured).toBe(false);
    });

    it('returns the existing testimonial on a duplicate submit within 60s, without creating a new document', async () => {
      const existing = {
        _id: mockId,
        ...dto,
        toObject: jest.fn().mockReturnValue({ ...dto, _id: mockId }),
      };
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      const result = await service.createTestimonial(dto, '127.0.0.1');

      expect(result).toHaveProperty('id');
      expect(mockTestimonialModel).not.toHaveBeenCalled();
    });

    it('rejects with BadRequestException when Turnstile verification fails', async () => {
      mockTurnstileService.verify.mockResolvedValue(false);

      await expect(service.createTestimonial(dto, '127.0.0.1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTestimonialModel.findOne).not.toHaveBeenCalled();
    });

    it('rejects with BadRequestException when the spam score is >= 80', async () => {
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockSpamDetectionService.detectSpam.mockReturnValue({ isSpam: true, score: 90 });

      await expect(service.createTestimonial(dto, '127.0.0.1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getApproved', () => {
    it('adds the featured filter only when featuredOnly is true', async () => {
      const chain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockTestimonialModel.find.mockReturnValue(chain);
      mockTestimonialModel.countDocuments.mockResolvedValue(0);

      await service.getApproved(10, 0, true);

      expect(mockTestimonialModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isApproved: true, isSpam: false, featured: true }),
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundException if the testimonial does not exist', async () => {
      mockTestimonialModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(service.getById(mockId.toString())).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for an invalid id', async () => {
      await expect(service.getById('not-an-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifica dell\'identità e profilo LinkedIn', () => {
    const LINKEDIN = 'https://www.linkedin.com/in/mario-rossi';
    const doc = (extra: Record<string, unknown>) => ({
      _id: mockId,
      authorName: 'Mario Rossi',
      rating: 5,
      content: 'Ottimo lavoro.',
      isApproved: true,
      isSpam: false,
      toObject() { return { ...this, _id: mockId }; },
      ...extra,
    });
    const findReturning = (docs: unknown[]) => {
      const chain: any = { sort: jest.fn(), limit: jest.fn(), skip: jest.fn(), exec: jest.fn().mockResolvedValue(docs) };
      ['sort', 'limit', 'skip'].forEach(k => chain[k].mockReturnValue(chain));
      mockTestimonialModel.find.mockReturnValue(chain);
      mockTestimonialModel.countDocuments.mockResolvedValue(docs.length);
    };

    it('salva il link LinkedIn ma crea sempre la testimonianza NON verificata', async () => {
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await service.createTestimonial({ ...dto, linkedinUrl: LINKEDIN }, '127.0.0.1');

      const saved = mockTestimonialModel.mock.calls[0][0];
      expect(saved.linkedinUrl).toBe(LINKEDIN);
      expect(saved.verified).toBe(false);
      expect(saved.verifiedAt).toBeNull();
    });

    it('un visitatore che manda verified:true nel body non si auto-verifica', async () => {
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await service.createTestimonial({ ...dto, linkedinUrl: LINKEDIN, verified: true, verifiedAt: new Date() }, '127.0.0.1');

      const saved = mockTestimonialModel.mock.calls[0][0];
      expect(saved.verified).toBe(false);
      expect(saved.verifiedAt).toBeNull();
    });

    it('la risposta al visitatore che ha appena scritto non contiene il link e non è verificata', async () => {
      mockTestimonialModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.createTestimonial({ ...dto, linkedinUrl: LINKEDIN }, '127.0.0.1');

      expect(result.verified).toBe(false);
      expect(result.linkedinUrl).toBeUndefined();
    });

    it('pubblico: il link LinkedIn esce solo per le testimonianze verificate', async () => {
      findReturning([
        doc({ authorName: 'Verificata', verified: true, linkedinUrl: LINKEDIN }),
        doc({ authorName: 'Non verificata', verified: false, linkedinUrl: 'https://www.linkedin.com/in/altra-persona' }),
      ]);

      const { data } = await service.getApproved(20, 0);

      const verified = data.find(t => t.authorName === 'Verificata')!;
      const unverified = data.find(t => t.authorName === 'Non verificata')!;
      expect(verified.verified).toBe(true);
      expect(verified.linkedinUrl).toBe(LINKEDIN);
      expect(unverified.verified).toBe(false);
      expect(unverified.linkedinUrl).toBeUndefined();
      expect(JSON.stringify(unverified)).not.toContain('altra-persona');
    });

    it('le testimonianze vecchie, senza i nuovi campi, risultano non verificate', async () => {
      findReturning([doc({ authorName: 'Vecchia' })]);

      const { data } = await service.getApproved(20, 0);

      expect(data[0].verified).toBe(false);
      expect(data[0].linkedinUrl).toBeUndefined();
    });

    it('verificata ma senza link LinkedIn: mostra il badge, nessun link', async () => {
      findReturning([doc({ verified: true })]);

      const { data } = await service.getApproved(20, 0);

      expect(data[0].verified).toBe(true);
      expect(data[0].linkedinUrl).toBeUndefined();
    });

    it('la risposta pubblica non espone verifiedAt né l\'email', async () => {
      findReturning([doc({ verified: true, verifiedAt: new Date(), email: 'mario@example.com', linkedinUrl: LINKEDIN })]);

      const { data } = await service.getApproved(20, 0);

      expect(data[0]).not.toHaveProperty('verifiedAt');
      expect(data[0]).not.toHaveProperty('email');
      expect(JSON.stringify(data[0])).not.toContain('mario@example.com');
    });

    describe('setVerified', () => {
      it('verifica: imposta verified e la data', async () => {
        mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(doc({ verified: true, verifiedAt: new Date(), linkedinUrl: LINKEDIN }));

        const result = await service.setVerified(mockId.toString(), true);

        const update = mockTestimonialModel.findByIdAndUpdate.mock.calls[0][1];
        expect(update.verified).toBe(true);
        expect(update.verifiedAt).toBeInstanceOf(Date);
        expect(result.verified).toBe(true);
        expect(result.linkedinUrl).toBe(LINKEDIN);
      });

      it('toglie la verifica: azzera anche la data', async () => {
        mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(doc({ verified: false, verifiedAt: null }));

        await service.setVerified(mockId.toString(), false);

        const update = mockTestimonialModel.findByIdAndUpdate.mock.calls[0][1];
        expect(update.verified).toBe(false);
        expect(update.verifiedAt).toBeNull();
      });

      it('NotFoundException se la testimonianza non esiste', async () => {
        mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(null);
        await expect(service.setVerified(mockId.toString(), true)).rejects.toThrow(NotFoundException);
      });

      it('BadRequestException per un id non valido', async () => {
        await expect(service.setVerified('non-un-id', true)).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('setFeatured', () => {
    it('updates the featured flag', async () => {
      const updated = { _id: mockId, authorName: 'Mario Rossi', featured: true };
      mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(updated);

      const result = await service.setFeatured(mockId.toString(), true);

      expect(result.id).toBe(mockId.toString());
      expect(mockTestimonialModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockId.toString(),
        expect.objectContaining({ featured: true }),
        { new: true },
      );
    });
  });

  describe('updateContent', () => {
    it('sanitizes and updates the content', async () => {
      const updated = { _id: mockId, authorName: 'Mario Rossi', content: 'Testo corretto.' };
      mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(updated);
      mockSpamDetectionService.sanitizeContent.mockReturnValue('Testo corretto.');

      const result = await service.updateContent(mockId.toString(), 'Testo corretto.');

      expect(result.id).toBe(mockId.toString());
      expect(mockSpamDetectionService.sanitizeContent).toHaveBeenCalledWith('Testo corretto.');
      expect(mockTestimonialModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockId.toString(),
        expect.objectContaining({ content: 'Testo corretto.' }),
        { new: true },
      );
    });

    it('throws NotFoundException if the testimonial does not exist', async () => {
      mockTestimonialModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.updateContent(mockId.toString(), 'Testo corretto.')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for an invalid id', async () => {
      await expect(service.updateContent('not-an-id', 'Testo corretto.')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete', () => {
    it('throws NotFoundException if the testimonial does not exist', async () => {
      mockTestimonialModel.findByIdAndDelete.mockResolvedValue(null);
      await expect(service.delete(mockId.toString())).rejects.toThrow(NotFoundException);
    });
  });
});
