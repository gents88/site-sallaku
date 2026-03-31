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

  /** Anonymized IP (last octet zeroed for IPv4) */
  @Prop({ default: '' })
  ip: string;

  /** ISO 3166-1 alpha-2 country code resolved via geoip-lite */
  @Prop({ default: '', index: true })
  country: string;

  @Prop({ default: '' })
  city: string;

  @Prop({ default: '' })
  region: string;

  /** Desktop | Mobile | Tablet */
  @Prop({ default: 'Desktop', index: true })
  deviceType: string;

  @Prop({ default: '' })
  browser: string;

  @Prop({ default: '' })
  os: string;

  /** direct | search | social | referral */
  @Prop({ default: 'direct', index: true })
  trafficSource: string;
}

export const PageViewSchema = SchemaFactory.createForClass(PageView);
PageViewSchema.index({ createdAt: -1 });
PageViewSchema.index({ visitorId: 1, createdAt: -1 });
PageViewSchema.index({ path: 1, createdAt: -1 });
PageViewSchema.index({ country: 1, createdAt: -1 });
PageViewSchema.index({ trafficSource: 1, createdAt: -1 });