import { Test, TestingModule } from '@nestjs/testing';
import { NotesController } from './notes.controller';
import { NotesService } from './services/notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { Types } from 'mongoose';

describe('NotesController', () => {
  let controller: NotesController;
  let service: NotesService;

  const mockArticleId = new Types.ObjectId().toString();
  const mockNoteId = new Types.ObjectId().toString();

  const mockNoteResponseDto = {
    id: mockNoteId,
    articleId: mockArticleId,
    name: 'John Doe',
    email: 'john@example.com',
    content: 'Great article!',
    isApproved: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [
        {
          provide: NotesService,
          useValue: {
            createNote: jest.fn().mockResolvedValue(mockNoteResponseDto),
            getNotes: jest.fn().mockResolvedValue({
              data: [mockNoteResponseDto],
              total: 1,
            }),
            getNoteById: jest.fn().mockResolvedValue(mockNoteResponseDto),
            updateNoteApprovalStatus: jest.fn().mockResolvedValue(mockNoteResponseDto),
            markAsSpam: jest.fn().mockResolvedValue(mockNoteResponseDto),
            deleteNote: jest.fn().mockResolvedValue(undefined),
            getArticleNotesStats: jest.fn().mockResolvedValue({
              total: 1,
              approved: 1,
              pending: 0,
              spam: 0,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<NotesController>(NotesController);
    service = module.get<NotesService>(NotesService);
  });

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      const dto: CreateNoteDto = {
        name: 'John Doe',
        email: 'john@example.com',
        content: 'Great article!',
        honeypot: '',
      };

      const mockRequest = {
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
      };

      const result = await controller.createNote(mockArticleId, dto, mockRequest);

      expect(result).toEqual(mockNoteResponseDto);
      expect(service.createNote).toHaveBeenCalledWith(
        mockArticleId,
        dto,
        '127.0.0.1',
      );
    });
  });

  describe('getNotes', () => {
    it('should return paginated notes', async () => {
      const result = await controller.getNotes(mockArticleId, { limit: 50, skip: 0 });

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(service.getNotes).toHaveBeenCalledWith(
        mockArticleId,
        true,
        50,
        0,
      );
    });

    it('should default limit/skip when the query is empty', async () => {
      await controller.getNotes(mockArticleId, {});

      expect(service.getNotes).toHaveBeenCalledWith(
        mockArticleId,
        true,
        50,
        0,
      );
    });
  });

  describe('getNotesStats', () => {
    it('should return notes statistics', async () => {
      const result = await controller.getNotesStats(mockArticleId);

      expect(result).toEqual({
        total: 1,
        approved: 1,
        pending: 0,
        spam: 0,
      });
    });
  });

  describe('getNoteById', () => {
    it('should return a single note', async () => {
      const result = await controller.getNoteById(mockNoteId);

      expect(result).toEqual(mockNoteResponseDto);
      expect(service.getNoteById).toHaveBeenCalledWith(mockNoteId);
    });
  });

  describe('approveNote', () => {
    it('should approve a note', async () => {
      const result = await controller.approveNote(mockNoteId);

      expect(result).toEqual(mockNoteResponseDto);
      expect(service.updateNoteApprovalStatus).toHaveBeenCalledWith(mockNoteId, true);
    });
  });

  describe('rejectNote', () => {
    it('should reject a note', async () => {
      const result = await controller.rejectNote(mockNoteId);

      expect(result).toEqual(mockNoteResponseDto);
      expect(service.updateNoteApprovalStatus).toHaveBeenCalledWith(mockNoteId, false);
    });
  });

  describe('markAsSpam', () => {
    it('should mark note as spam', async () => {
      const result = await controller.markAsSpam(mockNoteId);

      expect(result).toEqual(mockNoteResponseDto);
      expect(service.markAsSpam).toHaveBeenCalledWith(mockNoteId);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note', async () => {
      await controller.deleteNote(mockNoteId);

      expect(service.deleteNote).toHaveBeenCalledWith(mockNoteId);
    });
  });
});
