import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { About, AboutDocument } from './schemas/about.schema';
import { UpdateAboutDto } from './dto/update-about.dto';

@Injectable()
export class AboutService {
  constructor(@InjectModel(About.name) private model: Model<AboutDocument>) {}

  async get(): Promise<AboutDocument> {
    let doc = await this.model.findOne().exec();
    if (!doc) doc = await this.model.create({}); // seed empty doc on first access
    return doc;
  }

  async update(dto: UpdateAboutDto): Promise<AboutDocument> {
    let doc = await this.model.findOne().exec();
    if (!doc) {
      return this.model.create(dto);
    }
    Object.assign(doc, dto);
    return doc.save();
  }
}
