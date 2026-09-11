import {
  Injectable,
  NotFoundException,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { SavedResult, SavedResultDocument } from '../schemas/saved-result.schema';
import { CreateSavedResultDto } from '../dto/create-saved-result.dto';
import { SavedResultResponseDto, SavedResultListItemDto } from '../dto/saved-result-response.dto';

const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // stay well under MongoDB's 16MB document limit
const LIST_LIMIT = 50;

@Injectable()
export class SavedResultsService {
  constructor(
    @InjectModel(SavedResult.name) private savedResultModel: Model<SavedResultDocument>,
  ) {}

  async create(userId: string, dto: CreateSavedResultDto): Promise<SavedResultResponseDto> {
    const payloadSize = Buffer.byteLength(JSON.stringify(dto.payload ?? {}));
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException('Il risultato da salvare è troppo grande');
    }

    const saved = await new this.savedResultModel({
      userId: new Types.ObjectId(userId),
      toolType: dto.toolType,
      title: dto.title,
      payload: dto.payload,
    }).save();

    return this.mapToResponseDto(saved);
  }

  async findAllForUser(userId: string): Promise<{ data: SavedResultListItemDto[]; total: number }> {
    const query = { userId: new Types.ObjectId(userId) };

    const [items, total] = await Promise.all([
      this.savedResultModel
        .find(query, { payload: 0 })
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT)
        .exec(),
      this.savedResultModel.countDocuments(query),
    ]);

    const data = items.map((item) =>
      plainToInstance(SavedResultListItemDto, {
        id: item._id.toString(),
        toolType: item.toolType,
        title: item.title,
        createdAt: item.createdAt,
      }),
    );

    return { data, total };
  }

  async findOneForUser(userId: string, id: string): Promise<SavedResultResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID non valido');
    }

    const item = await this.savedResultModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!item) {
      throw new NotFoundException('Risultato non trovato');
    }

    return this.mapToResponseDto(item);
  }

  async removeForUser(userId: string, id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID non valido');
    }

    const result = await this.savedResultModel.findOneAndDelete({
      _id: id,
      userId: new Types.ObjectId(userId),
    });

    if (!result) {
      throw new NotFoundException('Risultato non trovato');
    }
  }

  private mapToResponseDto(doc: SavedResultDocument): SavedResultResponseDto {
    return plainToInstance(SavedResultResponseDto, {
      id: doc._id.toString(),
      toolType: doc.toolType,
      title: doc.title,
      payload: doc.payload,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  }
}
