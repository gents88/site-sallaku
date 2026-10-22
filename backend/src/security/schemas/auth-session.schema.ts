import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuthSessionDocument = AuthSession & Document;

/** Come REFRESH_TOKEN_EXPIRY in auth.service: una sessione non rinnovata per tanto non è più valida. */
export const SESSION_TTL_DAYS = 7;

/**
 * Metadati della sessione di un utente (dove e quando). Il refresh token è
 * uno solo per utente, quindi anche la sessione lo è: un nuovo login su un
 * altro dispositivo sostituisce la precedente. La validità vera resta nel
 * refreshTokenHash dell'utente; questo documento serve solo a mostrarla.
 */
@Schema({ collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt: Date;

  @Prop({ default: '' })
  ip: string;

  @Prop({ default: '', maxlength: 200 })
  userAgent: string;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: SESSION_TTL_DAYS * 24 * 60 * 60 });
