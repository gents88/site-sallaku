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

  /** direct | search | social | referral | internal | campaign */
  @Prop({ default: 'direct', index: true })
  trafficSource: string;

  /** Client-generated UUID for this specific view — used to attach dwell time later */
  @Prop({ default: '', index: true })
  viewId: string;

  /** Per-tab session id (sessionStorage) — groups the pages of one visit */
  @Prop({ default: '', index: true })
  sessionId: string;

  /** Active time spent on the page in ms (0 = never reported) */
  @Prop({ default: 0 })
  durationMs: number;

  /** entry = first page of the session (external arrival) | internal = SPA navigation */
  @Prop({ default: 'entry', enum: ['entry', 'internal'] })
  navigationType: string;

  @Prop({ default: '' })
  utmSource: string;

  @Prop({ default: '' })
  utmMedium: string;

  @Prop({ default: '' })
  utmCampaign: string;
}

export const PageViewSchema = SchemaFactory.createForClass(PageView);
PageViewSchema.index({ createdAt: -1 });
PageViewSchema.index({ visitorId: 1, createdAt: -1 });
PageViewSchema.index({ path: 1, createdAt: -1 });
PageViewSchema.index({ country: 1, createdAt: -1 });
PageViewSchema.index({ trafficSource: 1, createdAt: -1 });

/**
 * GDPR storage-limitation (Art. 5(1)(e)): raw page-view records auto-expire
 * instead of being kept indefinitely. Aggregated stats survive in
 * AnalyticsStats/MonthlyHistory, which hold only counters, not individual
 * records. Override via ANALYTICS_RETENTION_DAYS (defaults to 400 days,
 * matching GA4's default retention) — this is a policy choice, adjust it to
 * match your actual privacy policy.
 */
const RETENTION_DAYS = Number(process.env.ANALYTICS_RETENTION_DAYS) || 400;
PageViewSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_DAYS * 86400 });