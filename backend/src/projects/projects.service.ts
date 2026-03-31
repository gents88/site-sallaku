import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import slugify from 'slugify';
import { Project, ProjectDocument } from './schemas/project.schema';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(@InjectModel(Project.name) private projectModel: Model<ProjectDocument>) {}

  async findAll(): Promise<ProjectDocument[]> {
    return this.projectModel.find().sort({ order: 1, createdAt: -1 }).lean().exec() as unknown as Promise<ProjectDocument[]>;
  }

  async findOne(id: string): Promise<ProjectDocument> {
    const project = await this.projectModel.findById(id).exec();
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    return project;
  }

  async create(dto: CreateProjectDto): Promise<ProjectDocument> {
    const slug = slugify(dto.title, { lower: true, strict: true });
    return this.projectModel.create({ ...dto, slug });
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectDocument> {
    const slug = dto.title ? slugify(dto.title, { lower: true, strict: true }) : undefined;
    const update = slug ? { ...dto, slug } : dto;
    const project = await this.projectModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!project) throw new NotFoundException(`Project #${id} not found`);
    return project;
  }

  async remove(id: string): Promise<void> {
    const result = await this.projectModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Project #${id} not found`);
  }
}
