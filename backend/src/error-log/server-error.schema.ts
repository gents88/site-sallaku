import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ServerErrorDocument = ServerError & Document;

/**
 * Un errore 5xx raggruppato per "impronta" (metodo + rotta + messaggio): la
 * stessa eccezione ripetuta mille volte è una riga con count=1000, non mille.
 */
@Schema({ collection: 'server_errors' })
export class ServerError {
  @Prop({ required: true, unique: true })
  fingerprint: string;

  @Prop({ required: true })
  method: string;

  /** Rotta normalizzata: /api/v1/blog/posts/:id */
  @Prop({ required: true })
  route: string;

  /** Ultimo URL reale (senza query string) */
  @Prop({ default: '' })
  path: string;

  @Prop({ required: true })
  status: number;

  @Prop({ default: 'Error' })
  name: string;

  @Prop({ default: '' })
  message: string;

  @Prop({ default: '' })
  stack: string;

  @Prop({ default: 0 })
  count: number;

  /** Occorrenze per giorno UTC: { '2026-10-17': 3 } */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  days: Record<string, number>;

  @Prop({ type: Date, required: true })
  firstSeenAt: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt: Date;

  @Prop({ default: '' })
  lastRequestId: string;

  /** Segnato risolto dalla dashboard; torna null alla prossima occorrenza. */
  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;
}

export const ServerErrorSchema = SchemaFactory.createForClass(ServerError);
ServerErrorSchema.index({ resolvedAt: 1, lastSeenAt: -1 });
// Un errore che non si ripete da 30 giorni sparisce da solo.
ServerErrorSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
