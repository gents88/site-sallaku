import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AboutService } from './about.service';
import { About } from './schemas/about.schema';
import { CacheService } from '../common/services/cache.service';

describe('AboutService', () => {
  let service: AboutService;
  let mockModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };
    mockCache = {
      getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AboutService,
        { provide: getModelToken(About.name), useValue: mockModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<AboutService>(AboutService);
  });

  describe('get', () => {
    it('returns the existing document when one exists', async () => {
      mockModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ headline: 'Hi' }) }),
      });

      const result = await service.get();

      expect(result).toEqual({ headline: 'Hi' });
      expect(mockModel.create).not.toHaveBeenCalled();
    });

    it('seeds an empty document on first access', async () => {
      mockModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      });
      mockModel.create.mockResolvedValue({ toObject: () => ({ headline: '' }) });

      const result = await service.get();

      expect(mockModel.create).toHaveBeenCalledWith({});
      expect(result).toEqual({ headline: '' });
    });
  });

  describe('update', () => {
    it('creates a new document when none exists yet', async () => {
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      mockModel.create.mockResolvedValue({ headline: 'New' });

      const result = await service.update({ headline: 'New' } as any);

      expect(result).toEqual({ headline: 'New' });
      expect(mockCache.invalidate).toHaveBeenCalledWith('about:public');
    });

    it('merges the DTO into the existing document and saves it', async () => {
      const existing = { headline: 'Old', save: jest.fn() };
      existing.save.mockResolvedValue({ headline: 'Updated' });
      mockModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      await service.update({ headline: 'Updated' } as any);

      expect(existing.headline).toBe('Updated');
      expect(existing.save).toHaveBeenCalled();
      expect(mockCache.invalidate).toHaveBeenCalledWith('about:public');
    });
  });
});
