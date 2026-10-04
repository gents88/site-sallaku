import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { SavedResultsController } from './saved-results.controller';
import { SavedResultsService } from './services/saved-results.service';
import { CreateSavedResultDto } from './dto/create-saved-result.dto';

describe('SavedResultsController', () => {
  let controller: SavedResultsController;
  let service: SavedResultsService;

  const mockUserId = new Types.ObjectId().toString();
  const mockId = new Types.ObjectId().toString();
  const mockRequest = { user: { _id: mockUserId } };

  const mockResponseDto = {
    id: mockId,
    toolType: 'pdf-translate',
    title: 'Contratto IT→EN',
    payload: { text: 'ok' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavedResultsController],
      providers: [
        {
          provide: SavedResultsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockResponseDto),
            findAllForUser: jest.fn().mockResolvedValue({ data: [mockResponseDto], total: 1 }),
            findOneForUser: jest.fn().mockResolvedValue(mockResponseDto),
            removeForUser: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<SavedResultsController>(SavedResultsController);
    service = module.get<SavedResultsService>(SavedResultsService);
  });

  it('creates a saved result scoped to req.user._id, not the request body', async () => {
    const dto: CreateSavedResultDto = {
      toolType: 'pdf-translate',
      title: 'Contratto IT→EN',
      payload: { text: 'ok' },
    };

    const result = await controller.create(mockRequest, dto);

    expect(result).toEqual(mockResponseDto);
    expect(service.create).toHaveBeenCalledWith(mockUserId, dto);
  });

  it('lists only the authenticated user’s results', async () => {
    const result = await controller.findAll(mockRequest);

    expect(result).toEqual({ data: [mockResponseDto], total: 1 });
    expect(service.findAllForUser).toHaveBeenCalledWith(mockUserId);
  });

  it('fetches a single result scoped to the authenticated user', async () => {
    const result = await controller.findOne(mockRequest, mockId);

    expect(result).toEqual(mockResponseDto);
    expect(service.findOneForUser).toHaveBeenCalledWith(mockUserId, mockId);
  });

  it('deletes a result scoped to the authenticated user', async () => {
    await controller.remove(mockRequest, mockId);

    expect(service.removeForUser).toHaveBeenCalledWith(mockUserId, mockId);
  });
});
