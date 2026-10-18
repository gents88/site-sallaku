import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const NOT_FOUND_KINDS = ['route', 'blog', 'project'] as const;
export type NotFoundKind = (typeof NOT_FOUND_KINDS)[number];

export type NotFoundHitDocument = NotFoundHit & Document;

/** Un URL del sito che ha portato un visitatore su una pagina inesistente. */
@Schema({ collection: 'not_found_hits' })
export class NotFoundHit {
  /** Percorso senza query string né frammento, es. /en/blog/vecchio-slug */
  @Prop({ type: String, required: true, unique: true })
  path: string;

  /** route = nessuna rotta Angular; blog/project = slug che il backend non conosce */
  @Prop({ type: String, enum: NOT_FOUND_KINDS, default: 'route' })
  kind: NotFoundKind;

  @Prop({ type: Number, default: 0 })
  count: number;

  @Prop({ type: Date, required: true })
  firstSeenAt: Date;

  @Prop({ type: Date, required: true })
  lastSeenAt: Date;

  /** Da dove arrivava il visitatore (solo origine + percorso, mai la query string). */
  @Prop({ type: String, default: '' })
  lastReferrer: string;

  /** Ignorato dalla dashboard; torna null se il link rotto si ripresenta. */
  @Prop({ type: Date, default: null })
  dismissedAt: Date | null;
}

export const NotFoundHitSchema = SchemaFactory.createForClass(NotFoundHit);
NotFoundHitSchema.index({ dismissedAt: 1, count: -1 });
NotFoundHitSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
