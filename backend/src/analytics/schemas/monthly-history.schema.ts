import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type MonthlyHistoryDocument = MonthlyHistory & Document;

/**
 * One document per calendar month that captures a snapshot of monthly stats
 * immediately before they are reset.  Used for historical trend analysis.
 */
@Schema({ collection: 'analytics_monthly_history', timestamps: { createdAt: true, updatedAt: false } })
export class MonthlyHistory {
  /** "YYYY-MM" format, e.g. "2026-02" — unique index prevents duplicate entries */
  @Prop({ required: true, unique: true, index: true })
  month: string;

  /** Total page views recorded during this month */
  @Prop({ default: 0 })
  views: number;

  /** View counts keyed by country code for this month */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  locations: Record<string, number>;

  /** View counts keyed by device type for this month */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  devices: Record<string, number>;
}

export const MonthlyHistorySchema = SchemaFactory.createForClass(MonthlyHistory);
