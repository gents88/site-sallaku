import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { Project } from './schemas/project.schema';
import { CacheService } from '../common/services/cache.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let mockProjectModel: any;
  let mockCache: any;

  beforeEach(async () => {
    mockProjectModel = {
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
        ProjectsService,
        { provide: getModelToken(Project.name), useValue: mockProjectModel },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    it('slugifies the title and invalidates the list cache', async () => {
      mockProjectModel.create.mockResolvedValue({ _id: '1', title: 'My Cool Project', slug: 'my-cool-project' });

      const result = await service.create({ title: 'My Cool Project' } as any);

      expect(mockProjectModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'my-cool-project' }),
      );
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects:all');
      expect(result).toHaveProperty('slug', 'my-cool-project');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the project does not exist', async () => {
      mockProjectModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('re-slugifies only when the title changes', async () => {
      mockProjectModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: '1', slug: 'new-title' }),
      });

      await service.update('1', { title: 'New Title' } as any);

      expect(mockProjectModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({ slug: 'new-title' }),
        { new: true },
      );
      expect(mockCache.invalidate).toHaveBeenCalledWith('projects:all');
    });

    it('throws NotFoundException when updating a project that does not exist', async () => {
      mockProjectModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.update('missing', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('invalidates the cache after deleting', async () => {
      mockProjectModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: '1' }) });

      await service.remove('1');

      expect(mockCache.invalidate).toHaveBeenCalledWith('projects:all');
    });

    it('throws NotFoundException when the project does not exist', async () => {
      mockProjectModel.findByIdAndDelete.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
