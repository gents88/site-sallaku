import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Experience, ExperienceDocument } from './schemas/experience.schema';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { CacheService } from '../common/services/cache.service';

/** Read on every homepage render; written only from the admin area. */
const LIST_KEY = 'experiences:all';
const CACHE_TTL_MS = 300_000; // 5 min

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name) private model: Model<ExperienceDocument>,
    private readonly cache: CacheService,
  ) {}

  /** Public list — cached, and lean since it's only serialised to JSON. */
  async findAll(): Promise<unknown[]> {
    return this.cache.getOrSet(
      LIST_KEY,
      () => this.model.find().sort({ order: 1, startDate: -1 }).lean().exec(),
      CACHE_TTL_MS,
    );
  }

  async findOne(id: string): Promise<ExperienceDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Experience #${id} not found`);
    return doc;
  }

  async create(dto: CreateExperienceDto): Promise<ExperienceDocument> {
    const created = await this.model.create(dto);
    await this.cache.invalidate(LIST_KEY);
    return created;
  }

  async update(id: string, dto: UpdateExperienceDto): Promise<ExperienceDocument> {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!doc) throw new NotFoundException(`Experience #${id} not found`);
    await this.cache.invalidate(LIST_KEY);
    return doc;
  }

  async remove(id: string): Promise<void> {
    const result = await this.model.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Experience #${id} not found`);
    await this.cache.invalidate(LIST_KEY);
  }
}
