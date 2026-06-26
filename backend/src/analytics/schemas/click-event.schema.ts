import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ClickEventDocument = ClickEvent & Document;

/**
 * Records every intentional user interaction (CTA click, affiliate link, etc.)
 * that the frontend explicitly tracks for monetisation analytics.
 */
@Schema({ timestamps: true, collection: 'click_events' })
export class ClickEvent {
  @Prop({ required: true, index: true })
  visitorId: string;

  /**
   * Semantic category of the click.
   * Examples: 'cta', 'affiliate', 'social', 'blog', 'project', 'contact', 'cv_download'
   */
  @Prop({ required: true, index: true })
  eventType: string;

  /**
   * Human-readable label for the specific element.
   * Examples: 'hero_contact_btn', 'hero_projects_btn', 'udemy_affiliate', 'linkedin'
   */
  @Prop({ required: true, index: true })
  label: string;

  /** Page path where the click happened (/blog/my-post, /, /projects, …) */
  @Prop({ required: true })
  path: string;

  /** Optional destination URL (useful for affiliate links to measure intent) */
  @Prop({ default: '' })
  destination: string;

  /** ISO 639-1 language code of the UI at click time */
  @Prop({ default: '' })
  language: string;

  /** Desktop | Mobile | Tablet (resolved server-side from User-Agent) */
  @Prop({ default: 'Desktop', index: true })
  deviceType: string;
}

export const ClickEventSchema = SchemaFactory.createForClass(ClickEvent);
ClickEventSchema.index({ createdAt: -1 });
ClickEventSchema.index({ eventType: 1, createdAt: -1 });
ClickEventSchema.index({ label: 1, createdAt: -1 });
ClickEventSchema.index({ visitorId: 1, createdAt: -1 });
