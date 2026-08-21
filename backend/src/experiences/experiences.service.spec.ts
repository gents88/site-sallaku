import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ExperiencesService } from './experiences.service';
import { Experience } from './schemas/experience.schema';
import { CacheService } from '../common/services/cache.service';

describe('ExperiencesService', () => {
  let service: ExperiencesService;
  let mockModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockModel = {
      find: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mockCache = {
      getOrSet: jest.fn((_key: string, factory: () => unknown) => factory()),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExperiencesService,
        { provide: getModelToken(Experience.name), useValue: mockModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ExperiencesService>(ExperiencesService);
  });

  describe('create', () => {
    it('invalidates the list cache after creating', async () => {
      mockModel.create.mockResolvedValue({ _id: '1' });

      await service.create({ company: 'Acme' } as any);

      expect(mockCache.invalidate).toHaveBeenCalledWith('experiences:all');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when missing', async () => {
      mockModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws NotFoundException when updating a missing experience', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('invalidates the cache on success', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: '1' }) });

      await service.update('1', { role: 'CTO' } as any);

      expect(mockCache.invalidate).toHaveBeenCalledWith('experiences:all');
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the experience does not exist', async () => {
      mockModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('invalidates the cache after deleting', async () => {
      mockModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: '1' }) });

      await service.remove('1');

      expect(mockCache.invalidate).toHaveBeenCalledWith('experiences:all');
    });
  });
});
