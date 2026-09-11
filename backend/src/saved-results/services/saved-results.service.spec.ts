import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { NotFoundException, BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { SavedResultsService } from './saved-results.service';
import { SavedResult } from '../schemas/saved-result.schema';

describe('SavedResultsService', () => {
  let service: SavedResultsService;
  let mockSavedResultModel: any;

  const mockUserId = new Types.ObjectId().toString();
  const mockId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockSavedResultModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(mockId),
      save: jest.fn().mockResolvedValue({
        ...data,
        _id: new Types.ObjectId(mockId),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    }));
    mockSavedResultModel.find = jest.fn();
    mockSavedResultModel.findOne = jest.fn();
    mockSavedResultModel.findOneAndDelete = jest.fn();
    mockSavedResultModel.countDocuments = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedResultsService,
        { provide: getModelToken(SavedResult.name), useValue: mockSavedResultModel },
      ],
    }).compile();

    service = module.get<SavedResultsService>(SavedResultsService);
  });

  describe('create', () => {
    it('saves a result scoped to the user', async () => {
      const dto = { toolType: 'pdf-translate' as const, title: 'Contratto IT→EN', payload: { text: 'ok' } };

      const result = await service.create(mockUserId, dto);

      expect(result.title).toBe('Contratto IT→EN');
      expect(result.toolType).toBe('pdf-translate');
      expect(mockSavedResultModel).toHaveBeenCalledWith(
        expect.objectContaining({ toolType: 'pdf-translate', title: 'Contratto IT→EN' }),
      );
    });

    it('rejects a payload larger than the size limit', async () => {
      const bigPayload = { text: 'x'.repeat(9 * 1024 * 1024) };
      const dto = { toolType: 'pdf-translate' as const, title: 'Troppo grande', payload: bigPayload };

      await expect(service.create(mockUserId, dto)).rejects.toThrow(PayloadTooLargeException);
      expect(mockSavedResultModel).not.toHaveBeenCalled();
    });
  });

  describe('findAllForUser', () => {
    it('lists only the user’s results, most recent first, without the payload', async () => {
      const execMock = jest.fn().mockResolvedValue([
        { _id: new Types.ObjectId(mockId), toolType: 'ocr', title: 'Scontrino', createdAt: new Date() },
      ]);
      mockSavedResultModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: execMock,
      });
      mockSavedResultModel.countDocuments.mockResolvedValue(1);

      const result = await service.findAllForUser(mockUserId);

      expect(mockSavedResultModel.find).toHaveBeenCalledWith(
        { userId: new Types.ObjectId(mockUserId) },
        { payload: 0 },
      );
      expect(result.total).toBe(1);
      expect(result.data[0].title).toBe('Scontrino');
    });
  });

  describe('findOneForUser', () => {
    it('throws NotFoundException when the id is valid but not owned by the user', async () => {
      mockSavedResultModel.findOne.mockResolvedValue(null);

      await expect(service.findOneForUser(mockUserId, mockId)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a malformed id', async () => {
      await expect(service.findOneForUser(mockUserId, 'not-an-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeForUser', () => {
    it('throws NotFoundException when nothing owned by the user was deleted', async () => {
      mockSavedResultModel.findOneAndDelete.mockResolvedValue(null);

      await expect(service.removeForUser(mockUserId, mockId)).rejects.toThrow(NotFoundException);
      expect(mockSavedResultModel.findOneAndDelete).toHaveBeenCalledWith({
        _id: mockId,
        userId: new Types.ObjectId(mockUserId),
      });
    });
  });
});
