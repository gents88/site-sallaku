import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SecurityEventDocument = SecurityEvent & Document;

export const SECURITY_EVENT_TYPES = [
  'login_success',
  'login_failed',
  'otp_failed',
  'refresh_reuse',
  'session_revoked',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

/**
 * Retention degli eventi: la cronologia si cancella da sola dopo questi giorni (indice TTL, rolling:
 * ogni evento sparisce 3 giorni dopo essere stato registrato). Tiene pochi dati personali (IP, user agent).
 * Un indice TTL esistente non cambia da solo: lo allinea SecurityService.onModuleInit con collMod.
 */
export const SECURITY_EVENT_TTL_DAYS = 3;

@Schema({ collection: 'security_events', timestamps: { createdAt: true, updatedAt: false } })
export class SecurityEvent {
  @Prop({ type: String, enum: SECURITY_EVENT_TYPES, required: true })
  type: SecurityEventType;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '', maxlength: 200 })
  userAgent: string;

  /** Account coinvolto, quando esiste (un login su un'email sconosciuta non ne ha). */
  @Prop({ type: Types.ObjectId, default: null })
  userId: Types.ObjectId | null;

  /** Email o telefono (mascherato) usati nel tentativo. */
  @Prop({ default: '', maxlength: 120 })
  identifier: string;

  @Prop({ default: '', maxlength: 200 })
  detail: string;

  createdAt: Date;
}

export const SecurityEventSchema = SchemaFactory.createForClass(SecurityEvent);
SecurityEventSchema.index({ createdAt: -1 });
SecurityEventSchema.index({ type: 1, createdAt: -1 });
SecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: SECURITY_EVENT_TTL_DAYS * 24 * 60 * 60 });
