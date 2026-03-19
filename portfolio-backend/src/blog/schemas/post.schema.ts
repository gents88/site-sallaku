import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ unique: true })
  slug: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: '' })
  excerpt: string;

  @Prop({ default: '' })
  coverImage: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ default: false })
  published: boolean;

  @Prop({ default: null })
  publishedAt: Date;

  // SEO
  @Prop({ default: '' })
  metaTitle: string;

  @Prop({ default: '' })
  metaDescription: string;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ slug: 1 }, { unique: true });
PostSchema.index({ tags: 1 });
PostSchema.index({ published: 1, publishedAt: -1 });
