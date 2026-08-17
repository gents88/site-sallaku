import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Note } from '../schemas/note.schema';
import { Post } from '../../blog/schemas/post.schema';
import { NotesService } from './notes.service';
import { SpamDetectionService } from '../../common/services/spam-detection.service';
import { TurnstileService } from '../../common/services/turnstile.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('NotesService', () => {
  let service: NotesService;
  let mockNoteModel: any;
  let mockPostModel: any;
  let mockSpamDetectionService: any;
  let mockTurnstileService: any;

  const mockArticleId = new Types.ObjectId();
  const mockNoteId = new Types.ObjectId();

  beforeEach(async () => {
    mockNoteModel = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: mockNoteId,
      save: jest.fn().mockResolvedValue({
        ...data,
        _id: mockNoteId,
        toObject: jest.fn().mockReturnValue({ ...data, _id: mockNoteId }),
      }),
    }));
    mockNoteModel.find = jest.fn();
    mockNoteModel.findById = jest.fn();
    mockNoteModel.findByIdAndUpdate = jest.fn();
    mockNoteModel.findByIdAndDelete = jest.fn();
    mockNoteModel.countDocuments = jest.fn();

    mockPostModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    };

    mockSpamDetectionService = {
      detectSpam: jest.fn().mockReturnValue({ isSpam: false, score: 10 }),
      sanitizeContent: jest.fn((content) => content),
    };

    mockTurnstileService = {
      verify: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: getModelToken(Note.name), useValue: mockNoteModel },
        { provide: getModelToken(Post.name), useValue: mockPostModel },
        { provide: SpamDetectionService, useValue: mockSpamDetectionService },
        { provide: TurnstileService, useValue: mockTurnstileService },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  describe('createNote', () => {
    const dto = {
      name: 'John Doe',
      email: 'john@example.com',
      content: 'Great article!',
      honeypot: '',
    };

    it('should create a note successfully', async () => {
      const result = await service.createNote(mockArticleId.toString(), dto, '127.0.0.1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('articleId');
    });

    it('should throw BadRequestException for invalid articleId', async () => {
      await expect(
        service.createNote('invalid-id', dto, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when Turnstile verification fails', async () => {
      mockTurnstileService.verify.mockResolvedValue(false);

      await expect(
        service.createNote(mockArticleId.toString(), dto, '127.0.0.1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockNoteModel).not.toHaveBeenCalled();
    });

    it('should detect spam and reject', async () => {
      mockSpamDetectionService.detectSpam.mockReturnValue({
        isSpam: true,
        score: 85,
      });

      await expect(
        service.createNote(mockArticleId.toString(), { ...dto, content: 'Click here for viagra!' }, '127.0.0.1'),
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
          toObject: jest.fn().mockReturnValue({
            _id: mockNoteId,
            articleId: mockArticleId,
            name: 'John Doe',
            content: 'Great!',
            isApproved: true,
          }),
        },
      ];

      mockNoteModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockNotes),
            }),
          }),
        }),
      });

      mockNoteModel.countDocuments.mockResolvedValue(1);

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
        toObject: jest.fn().mockReturnValue({ _id: mockNoteId, articleId: mockArticleId, content: 'Test' }),
      };

      mockNoteModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockNote),
      });

      const result = await service.getNoteById(mockNoteId.toString());

      expect(result).toHaveProperty('id');
    });

    it('should throw NotFoundException if note not found', async () => {
      mockNoteModel.findById.mockReturnValue({
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
        toObject: jest.fn().mockReturnValue({ _id: mockNoteId, articleId: mockArticleId, isApproved: true }),
      };

      mockNoteModel.findByIdAndUpdate.mockResolvedValue(mockNote);

      const result = await service.updateNoteApprovalStatus(mockNoteId.toString(), true);

      expect(result).toHaveProperty('id');
    });
  });

  describe('markAsSpam', () => {
    it('should mark note as spam', async () => {
      const mockNote = {
        _id: mockNoteId,
        articleId: mockArticleId,
        isSpam: true,
        toObject: jest.fn().mockReturnValue({ _id: mockNoteId, articleId: mockArticleId, isSpam: true }),
      };

      mockNoteModel.findByIdAndUpdate.mockResolvedValue(mockNote);

      const result = await service.markAsSpam(mockNoteId.toString());

      expect(result).toHaveProperty('id');
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      mockNoteModel.findByIdAndDelete.mockResolvedValue({
        _id: mockNoteId,
      });

      await expect(
        service.deleteNote(mockNoteId.toString()),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException if note not found', async () => {
      mockNoteModel.findByIdAndDelete.mockResolvedValue(null);

      await expect(
        service.deleteNote(mockNoteId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getArticleNotesStats', () => {
    it('should return notes statistics', async () => {
      mockNoteModel.countDocuments
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
