import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CacheService } from '../common/services/cache.service';

/** Read on every homepage and /projects render; written only from admin. */
const LIST_KEY = 'projects:all';
const CACHE_TTL_MS = 300_000; // 5 min

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    private readonly cache: CacheService,
  ) {}

  /** Public list — cached; already lean before, kept that way. */
  async findAll(): Promise<unknown[]> {
    return this.cache.getOrSet(
      LIST_KEY,
      () => this.projectModel.find().sort({ order: 1, createdAt: -1 }).lean().exec(),
      CACHE_TTL_MS,
    );
  }

  async findOne(id: string): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    return project;
  }

  async create(dto: CreateProjectDto): Promise<ProjectDocument> {
    const slug = slugify(dto.title, { lower: true, strict: true });
    const created = await this.projectModel.create({ ...dto, slug });
    await this.cache.invalidate(LIST_KEY);
    return created;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument> {
    const slug = dto.title ? slugify(dto.title, { lower: true, strict: true }) : undefined;
    const update = slug ? { ...dto, slug } : dto;
    const project = await this.projectModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    await this.cache.invalidate(LIST_KEY);
    return project;
  }

  async remove(id: string): Promise<void> {
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Project #${id} not found`);
    await this.cache.invalidate(LIST_KEY);
  }
}
