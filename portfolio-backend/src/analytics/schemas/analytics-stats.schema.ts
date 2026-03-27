import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type AnalyticsStatsDocument = AnalyticsStats & Document;

/**
 * Singleton document (one per app) that maintains running totals.
 * Monthly fields are reset on the 1st of each month; total fields never reset.
 */
@Schema({ collection: 'analytics_stats' })
export class AnalyticsStats {
  /** All-time total page views — never resets */
  @Prop({ default: 0 })
  totalViews: number;

  /** Current-month page views — reset on the 1st of each month */
  @Prop({ default: 0 })
  monthlyViews: number;

  /** All-time view counts keyed by country code (ISO 3166-1 alpha-2), e.g. { IT: 300, US: 120 } */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  locations: Record<string, number>;

  /** Current-month view counts keyed by country code */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  monthlyLocations: Record<string, number>;

  /** All-time view counts keyed by device type ("Desktop" | "Mobile" | "Tablet") */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  devices: Record<string, number>;

  /** Current-month view counts keyed by device type */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  monthlyDevices: Record<string, number>;

  /** UTC timestamp of the last monthly reset */
  @Prop()
  lastResetAt: Date;
}

export const AnalyticsStatsSchema = SchemaFactory.createForClass(AnalyticsStats);
