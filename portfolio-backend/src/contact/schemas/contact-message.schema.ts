import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactMessageDocument = ContactMessage & Document;

@Schema({ timestamps: true, collection: 'contact_messages' })
export class ContactMessage {
  @Prop({ required: true, maxlength: 80 })
  name: string;

  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ required: true, maxlength: 150 })
  subject: string;

  @Prop({ required: true, maxlength: 2000 })
  message: string;

  @Prop({ default: false })
  read: boolean;
}

export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);
