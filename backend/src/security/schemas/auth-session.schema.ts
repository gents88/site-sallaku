import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuthSessionDocument = AuthSession & Document;

/** Come REFRESH_TOKEN_EXPIRY in auth.service: una sessione non rinnovata per tanto non è più valida. */
export const SESSION_TTL_DAYS = 7;

/** Quanti token ritirati si tengono: abbastanza per rinnovi simultanei, non una cronologia. */
export const MAX_RETIRED_HASHES = 6;

/** Dispositivi collegati insieme per lo stesso utente: oltre, si chiude il meno recente. */
export const MAX_SESSIONS_PER_USER = 10;

/**
 * Una sessione = un dispositivo/browser con il suo refresh token. Prima il refresh token era uno
 * solo per utente e un nuovo accesso (es. dal telefono) disconnetteva tutti gli altri.
 *
 * Qui sta anche la validità vera: l'hash del refresh token corrente. Il documento sparisce da solo
 * dopo SESSION_TTL_DAYS senza rinnovi, come il token.
 */
@Schema({ collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  /** Identificativo della sessione, anche nei JWT (claim `sid`). Assente nelle sessioni create prima del multi-dispositivo. */
  @Prop({ type: String })
  sid?: string;

  /** SHA-256 del refresh token corrente, poi bcrypt: mai il token in chiaro. */
  @Prop({ type: String, select: false })
  refreshTokenHash?: string;

  /**
   * Refresh token ritirati di recente, ognuno valido per una breve tolleranza dal momento in cui è stato
   * sostituito: più schede (o richieste ripetute) che rinnovano insieme presentano lo stesso token, e
   * quelle arrivate per ultime non devono essere scambiate per un furto. Un elenco e non un solo
   * "precedente" perché con tre rinnovi simultanei il primo token è già due rotazioni indietro.
   */
  @Prop({ type: [{ _id: false, hash: String, retiredAt: Date }], select: false, default: undefined })
  retiredRefreshHashes?: Array<{ hash: string; retiredAt: Date }>;

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
AuthSessionSchema.index({ userId: 1 });
// Più sessioni per utente, ma una sola per (utente, sid). Le sessioni senza sid (precedenti) non entrano nell'indice.
AuthSessionSchema.index({ userId: 1, sid: 1 }, { unique: true, partialFilterExpression: { sid: { $type: 'string' } } });
