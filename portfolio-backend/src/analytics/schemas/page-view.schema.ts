import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PageViewDocument = PageView & Document;

@Schema({ timestamps: true, collection: 'page_views' })
export class PageView {
  @Prop({ required: true, index: true })
  visitorId: string;

  @Prop({ required: true, trim: true })
  path: string;

  @Prop({ default: '' })
  referrer: string;

  @Prop({ default: '' })
  language: string;

  @Prop({ default: '' })
  userAgent: string;
}

export const PageViewSchema = SchemaFactory.createForClass(PageView);
PageViewSchema.index({ createdAt: -1 });
PageViewSchema.index({ visitorId: 1, createdAt: -1 });
PageViewSchema.index({ path: 1, createdAt: -1 });