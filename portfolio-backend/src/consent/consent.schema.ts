import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConsentDocument = Consent & Document;

@Schema({ collection: 'consents', timestamps: true })
export class Consent {
  @Prop({ required: false })
  userId?: string;

  @Prop({ required: true })
  country: string;

  @Prop({ default: false })
  analytics: boolean;

  @Prop({ default: false })
  marketing: boolean;

  @Prop({ default: false })
  preferences: boolean;

  @Prop({ default: Date.now })
  timestamp: Date;
}

export const ConsentSchema = SchemaFactory.createForClass(Consent);
