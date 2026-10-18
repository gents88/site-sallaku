import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { LEAD_NOTE_MAX, LEAD_STATUSES, LeadStatus } from '../lead';

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

  @Prop({ type: Date, default: null })
  repliedAt: Date | null;

  @Prop({ default: '' })
  replyText: string;

  /**
   * Stato commerciale. I messaggi salvati prima non ce l'hanno: vedi
   * effectiveLeadStatus (risposto = in trattativa, altrimenti nuovo).
   */
  @Prop({ type: String, enum: LEAD_STATUSES })
  status?: LeadStatus;

  /** Promemoria di follow-up (compare nel campanello e in dashboard quando scade). */
  @Prop({ type: Date, default: null })
  followUpAt: Date | null;

  /** Nota interna, mai inviata al contatto. */
  @Prop({ type: String, default: '', maxlength: LEAD_NOTE_MAX })
  internalNote: string;
}

export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);
// Admin queries by read status; duplicate-detection by email+createdAt
ContactMessageSchema.index({ createdAt: -1 });
ContactMessageSchema.index({ read: 1, createdAt: -1 });
ContactMessageSchema.index({ email: 1, createdAt: -1 });
ContactMessageSchema.index({ followUpAt: 1 });
