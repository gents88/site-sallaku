import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { DEFAULT_BLOG_LANGUAGE, BLOG_LANGUAGES, BlogLanguage } from '../blog.constants';

export type PostDocument = Post & Document;

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '' })
  subtitle: string;

  @Prop({ unique: true })
  slug: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: '' })
  excerpt: string;

  @Prop({ enum: BLOG_LANGUAGES, default: DEFAULT_BLOG_LANGUAGE })
  language: BlogLanguage;

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

  // Analytics
  @Prop({ default: 0 })
  viewCount: number;
}

export const PostSchema = SchemaFactory.createForClass(Post);
PostSchema.index({ tags: 1 });
PostSchema.index({ published: 1, publishedAt: -1 });
