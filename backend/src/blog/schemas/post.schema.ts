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

  // Per-language URL slugs, generated once from title_xx (see
  // BlogService.fillLocalizedSlugs) so /sq/blog/... carries an Albanian
  // slug instead of the Italian one. Never regenerated once set: changing
  // them would break links already shared. Empty → falls back to `slug`.
  @Prop({ default: '' })
  slug_en: string;

  @Prop({ default: '' })
  slug_sq: string;

  @Prop({ default: '' })
  slug_pt: string;

  @Prop({ default: '' })
  slug_es: string;

  @Prop({ default: '' })
  slug_fr: string;

  @Prop({ default: '' })
  slug_de: string;

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

  // Multilanguage translations (title/content/excerpt default to Italian)
  @Prop({ default: '' })
  title_en: string;

  @Prop({ default: '' })
  title_sq: string;

  @Prop({ default: '' })
  content_en: string;

  @Prop({ default: '' })
  content_sq: string;

  @Prop({ default: '' })
  excerpt_en: string;

  @Prop({ default: '' })
  excerpt_sq: string;

  @Prop({ default: '' })
  title_pt: string;

  @Prop({ default: '' })
  content_pt: string;

  @Prop({ default: '' })
  excerpt_pt: string;

  @Prop({ default: '' })
  title_es: string;

  @Prop({ default: '' })
  content_es: string;

  @Prop({ default: '' })
  excerpt_es: string;

  @Prop({ default: '' })
  title_fr: string;

  @Prop({ default: '' })
  content_fr: string;

  @Prop({ default: '' })
  excerpt_fr: string;

  @Prop({ default: '' })
  title_de: string;

  @Prop({ default: '' })
  content_de: string;

  @Prop({ default: '' })
  excerpt_de: string;

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
/**
 * Indice full-text per /search (ricerca completa, ordinata per pertinenza).
 * default_language 'none': i post sono in 7 lingue, niente stemming di una
 * sola. language_override punta a un campo inesistente perché Mongo userebbe
 * altrimenti il campo `language` del post, e 'sq' (albanese) non è una lingua
 * supportata: la creazione dell'indice fallirebbe.
 */
PostSchema.index(
  { title: 'text', title_en: 'text', title_sq: 'text', title_es: 'text', title_pt: 'text', title_fr: 'text', title_de: 'text', excerpt: 'text', excerpt_en: 'text', excerpt_sq: 'text', excerpt_es: 'text', excerpt_pt: 'text', excerpt_fr: 'text', excerpt_de: 'text', content: 'text', content_en: 'text', content_sq: 'text', content_es: 'text', content_pt: 'text', content_fr: 'text', content_de: 'text', tags: 'text' },
  {
    name: 'post_fulltext',
    weights: { title: 10, title_en: 10, title_sq: 10, title_es: 10, title_pt: 10, title_fr: 10, title_de: 10, excerpt: 3, excerpt_en: 3, excerpt_sq: 3, excerpt_es: 3, excerpt_pt: 3, excerpt_fr: 3, excerpt_de: 3, content: 1, content_en: 1, content_sq: 1, content_es: 1, content_pt: 1, content_fr: 1, content_de: 1, tags: 6 },
    default_language: 'none',
    language_override: 'textSearchLanguage',
  },
);
