import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExperienceDocument = Experience & Document;

@Schema({ timestamps: true, collection: 'experiences' })
export class Experience {
  @Prop({ required: true, trim: true })
  company: string;

  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ default: '' })
  endDate: string;

  @Prop({ default: false })
  current: boolean;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  technologies: string[];

  @Prop({ default: '' })
  location: string;

  @Prop({ default: 0 })
  order: number;
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);
