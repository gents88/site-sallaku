import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

export type OtpChannel = 'sms' | 'email';

@Schema({ timestamps: true, collection: 'otps' })
export class Otp {
  /** Normalized phone (E.164) or lowercase email — used for all lookups */
  @Prop({ required: true, index: true })
  identifier: string;

  /** Delivery channel: sms = phone number, email = email address */
  @Prop({ required: true, enum: ['sms', 'email'] })
  channel: OtpChannel;

  @Prop({ required: true })
  otpHash: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  used: boolean;

  @Prop({ default: 0 })
  attempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL: MongoDB auto-deletes documents 30 min after expiresAt (cleanup)
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 1800 });
