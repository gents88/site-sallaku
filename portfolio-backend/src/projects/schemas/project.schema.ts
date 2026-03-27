import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true, collection: 'projects' })
export class Project {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ unique: true })
  slug: string;

  @Prop({ type: [String], default: [] })
  technologies: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: '' })
  liveUrl: string;

  @Prop({ default: '' })
  repoUrl: string;

  @Prop({ default: false })
  featured: boolean;

  @Prop({ default: 0 })
  order: number;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
// Featured projects sorted by order is the most common public query
ProjectSchema.index({ featured: 1, order: 1 });
ProjectSchema.index({ order: 1 });
