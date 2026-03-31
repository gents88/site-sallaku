import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CronStateDocument = CronState & Document;

/**
 * Singleton document that persists the last execution date of each scheduled job.
 * The `jobName` field acts as the unique key.
 */
@Schema({ collection: 'cron_states' })
export class CronState {
  /** Unique name of the cron job (e.g. 'daily-summary') */
  @Prop({ required: true, unique: true, index: true })
  jobName: string;

  /** Last successful execution date in YYYY-MM-DD format */
  @Prop({ default: '' })
  lastSentDate: string;
}

export const CronStateSchema = SchemaFactory.createForClass(CronState);
