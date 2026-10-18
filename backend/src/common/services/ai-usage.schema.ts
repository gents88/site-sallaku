import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AiUsageDayDocument = AiUsageDay & Document;

/** Contatori AI di un giorno (UTC), per la dashboard e per il budget che deve sopravvivere ai riavvii. */
@Schema({ timestamps: true, collection: 'ai_usage_daily' })
export class AiUsageDay {
  /** YYYY-MM-DD, UTC: lo stesso giorno dei contatori di AiQuotaService. */
  @Prop({ required: true, unique: true })
  date: string;

  @Prop({ default: 0 })
  tokens: number;

  /** Richieste agli strumenti /ai/* accettate. */
  @Prop({ default: 0 })
  calls: number;

  /** Richieste per strumento: { 'summarize-file': 3, ... } */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  byEndpoint: Record<string, number>;

  /** Token per provenienza: { tools, chatbot } */
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  tokensBySource: Record<string, number>;

  /** Richieste rifiutate perché l'IP aveva finito la quota giornaliera (429). */
  @Prop({ default: 0 })
  rejectedIpCap: number;

  /** Richieste rifiutate perché il budget globale di token era finito (503). */
  @Prop({ default: 0 })
  rejectedBudget: number;

  /** Hash (mai IP in chiaro) degli IP che hanno toccato il tetto, al massimo MAX_CAPPED_IPS. */
  @Prop({ type: [String], default: [] })
  cappedIps: string[];
}

export const AiUsageDaySchema = SchemaFactory.createForClass(AiUsageDay);
// Sei mesi di storico bastano per i grafici; poi Mongo li cancella da sé.
AiUsageDaySchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
