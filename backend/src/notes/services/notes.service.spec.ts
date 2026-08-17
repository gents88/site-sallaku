import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Note } from '../schemas/note.schema';
import { NotesService } from './notes.service';
import { SpamDetectionService } from '../../common/services/spam-detection.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('NotesService', () => {
  let service: NotesService;
  let mockNoteModel: any;
  let mockSpamDetectionService: any;

  const mockArticleId = new Types.ObjectId();
  const mockNoteId = new Types.ObjectId();

  beforeEach(async () => {
    mockNoteModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      exec: jest.fn(),
      sort: jest.fn(),
      limit: jest.fn(),
      skip: jest.fn(),
      save: jest.fn(),
    };

    mockSpamDetectionService = {
      detectSpam: jest.fn().mockReturnValue({ isSpam: false, score: 10 }),
      sanitizeContent: jest.fn((content) => content),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        {
          provide: getModelToken(Note.name),
          useValue: mockNoteModel,
        },
        {
          provide: SpamDetectionService,
          useValue: mockSpamDetectionService,
        },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      const dto = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'Great article!',
        honeypot: '',
      };

      const mockNote = {
        _id: mockNoteId,
        articleId: mockArticleId,
        ...dto,
        isApproved: true,
        isSpam: false,
        spamScore: 10,
        toObject: jest.fn().mockReturnValue({ _id: mockNoteId, articleId: mockArticleId }),
      };

      mockNoteModel.prototype.save = jest.fn().mockResolvedValue(mockNote);

      const result = await service.createNote(mockArticleId.toString(), dto, '127.0.0.1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('articleId');
    });

    it('should throw BadRequestException for invalid articleId', async () => {
      const dto = { content: 'Test' };

      await expect(
        service.createNote('invalid-id', dto, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should detect spam and reject', async () => {
      mockSpamDetectionService.detectSpam.mockReturnValue({
        isSpam: true,
        score: 85,
      });

      const dto = {
        content: 'Click here for viagra!',
        honeypot: '',
      };

      await expect(
        service.createNote(mockArticleId.toString(), dto, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getNotes', () => {
    it('should return paginated notes', async () => {
      const mockNotes = [
        {
          _id: mockNoteId,
          articleId: mockArticleId,
          name: 'John Doe',
          content: 'Great!',
          isApproved: true,
          toObject: jest.fn(),
        },
      ];

      mockNoteModel.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockResolvedValue(mockNotes),
          }),
        }),
      });

      mockNoteModel.countDocuments = jest.fn().mockResolvedValue(1);

      const result = await service.getNotes(mockArticleId.toString(), true, 50, 0);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result.total).toBe(1);
    });

    it('should throw BadRequestException for invalid articleId', async () => {
      await expect(
        service.getNotes('invalid-id', true, 50, 0),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getNoteById', () => {
    it('should return a note by id', async () => {
      const mockNote = {
        _id: mockNoteId,
        articleId: mockArticleId,
        content: 'Test',
        toObject: jest.fn(),
      };

      mockNoteModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockNote),
      });

      const result = await service.getNoteById(mockNoteId.toString());

      expect(result).toHaveProperty('id');
    });

    it('should throw NotFoundException if note not found', async () => {
      mockNoteModel.findById = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getNoteById(mockNoteId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateNoteApprovalStatus', () => {
    it('should update note approval status', async () => {
      const mockNote = {
        _id: mockNoteId,
        articleId: mockArticleId,
        isApproved: true,
        toObject: jest.fn(),
      };

      mockNoteModel.findByIdAndUpdate = jest.fn().mockResolvedValue(mockNote);

      const result = await service.updateNoteApprovalStatus(mockNoteId.toString(), true);

      expect(result).toHaveProperty('id');
    });
  });

  describe('markAsSpam', () => {
    it('should mark note as spam', async () => {
      const mockNote = {
        _id: mockNoteId,
        isSpam: true,
        toObject: jest.fn(),
      };

      mockNoteModel.findByIdAndUpdate = jest.fn().mockResolvedValue(mockNote);

      const result = await service.markAsSpam(mockNoteId.toString());

      expect(result).toHaveProperty('id');
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      mockNoteModel.findByIdAndDelete = jest.fn().mockResolvedValue({
        _id: mockNoteId,
      });

      await expect(
        service.deleteNote(mockNoteId.toString()),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException if note not found', async () => {
      mockNoteModel.findByIdAndDelete = jest.fn().mockResolvedValue(null);

      await expect(
        service.deleteNote(mockNoteId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getArticleNotesStats', () => {
    it('should return notes statistics', async () => {
      mockNoteModel.countDocuments = jest
        .fn()
        .mockResolvedValueOnce(15) // total
        .mockResolvedValueOnce(13) // approved
        .mockResolvedValueOnce(1) // pending
        .mockResolvedValueOnce(1); // spam

      const result = await service.getArticleNotesStats(mockArticleId.toString());

      expect(result).toEqual({
        total: 15,
        approved: 13,
        pending: 1,
        spam: 1,
      });
    });
  });
});
