import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

@Schema({ timestamps: true, collection: 'newsletter_campaigns' })
export class NewsletterCampaign {
  @Prop({ required: true, trim: true, maxlength: 200 })
  subject: string;

  /** HTML del corpo, già sanificato al salvataggio. Il footer di disiscrizione è aggiunto all'invio. */
  @Prop({ required: true })
  html: string;

  @Prop({ default: 'draft', enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] })
  status: CampaignStatus;

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: Date, default: null })
  testSentAt: Date | null;

  @Prop({ type: Object, default: { total: 0, sent: 0, failed: 0 } })
  stats: { total: number; sent: number; failed: number };
}

export type NewsletterCampaignDocument = NewsletterCampaign & Document;
export const NewsletterCampaignSchema = SchemaFactory.createForClass(NewsletterCampaign);
NewsletterCampaignSchema.index({ status: 1, scheduledAt: 1 });

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

/**
 * Una riga per destinatario: è la coda. Fotografata al momento dell'invio
 * (chi si iscrive dopo non la riceve), presa in carico in modo atomico con
 * `lockedUntil` e ritentata fino a MAX_ATTEMPTS. Sopravvive ai riavvii.
 */
@Schema({ timestamps: true, collection: 'newsletter_deliveries' })
export class NewsletterDelivery {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  subscriberId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  unsubscribeToken: string;

  @Prop({ default: 'pending', enum: ['pending', 'sent', 'failed'] })
  status: DeliveryStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date, default: null })
  lockedUntil: Date | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: String, default: null })
  lastError: string | null;
}

export type NewsletterDeliveryDocument = NewsletterDelivery & Document;
export const NewsletterDeliverySchema = SchemaFactory.createForClass(NewsletterDelivery);
NewsletterDeliverySchema.index({ campaignId: 1, subscriberId: 1 }, { unique: true });
NewsletterDeliverySchema.index({ campaignId: 1, status: 1, lockedUntil: 1 });
