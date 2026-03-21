import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Experience, ExperienceDocument } from './schemas/experience.schema';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';

@Injectable()
export class ExperiencesService {
  constructor(@InjectModel(Experience.name) private model: Model<ExperienceDocument>) {}

  findAll(): Promise<ExperienceDocument[]> {
    return this.model.find().sort({ order: 1, startDate: -1 }).exec();
  }

  async findOne(id: string): Promise<ExperienceDocument> {
    const doc = await this.model.findById(id).exec();
    if (!doc) throw new NotFoundException(`Experience #${id} not found`);
    return doc;
  }

  create(dto: CreateExperienceDto): Promise<ExperienceDocument> {
    return this.model.create(dto);
  }

  async update(id: string, dto: UpdateExperienceDto): Promise<ExperienceDocument> {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!doc) throw new NotFoundException(`Experience #${id} not found`);
    return doc;
  }

  async remove(id: string): Promise<void> {
    const result = await this.model.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Experience #${id} not found`);
  }
}
