import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NewsletterSubscriberDocument = NewsletterSubscriber & Document;

export type NewsletterStatus = 'pending' | 'confirmed' | 'unsubscribed';

@Schema({ timestamps: true, collection: 'newsletter_subscribers' })
export class NewsletterSubscriber {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ default: 'pending', enum: ['pending', 'confirmed', 'unsubscribed'] })
  status: NewsletterStatus;

  /** SHA-256 hash of the confirm token sent by email — never store it in the clear, same as OTP codes. */
  @Prop({ select: false })
  confirmTokenHash?: string;

  @Prop({ select: false })
  confirmTokenExpires?: Date;

  /**
   * Long-lived, unhashed token embedded in every email's unsubscribe link.
   * Unlike the confirm token this one has to stay valid indefinitely (an
   * old newsletter issue must still be able to unsubscribe someone years
   * later) and carries no elevated privilege — knowing it only lets you
   * unsubscribe that one address, so it doesn't need OTP-grade secrecy.
   */
  @Prop({ required: true, unique: true })
  unsubscribeToken: string;

  @Prop({ default: null })
  confirmedAt?: Date | null;

  @Prop({ default: null })
  unsubscribedAt?: Date | null;
}

export const NewsletterSubscriberSchema = SchemaFactory.createForClass(NewsletterSubscriber);
