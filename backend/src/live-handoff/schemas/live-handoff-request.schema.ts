import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LiveHandoffStatus =
  | 'requested'
  | 'notified'
  | 'agent_joining'
  | 'live'
  | 'expired'
  | 'closed';

export const ACTIVE_LIVE_HANDOFF_STATUSES: LiveHandoffStatus[] = [
  'requested',
  'notified',
  'agent_joining',
  'live',
];

export type LiveHandoffRequestDocument = LiveHandoffRequest & Document;

@Schema({ timestamps: true })
export class LiveHandoffRequest {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({
    type: String,
    enum: ['requested', 'notified', 'agent_joining', 'live', 'expired', 'closed'],
    default: 'requested',
    index: true,
  })
  status: LiveHandoffStatus;

  @Prop({ maxlength: 500 })
  lastUserMessage?: string;

  @Prop()
  locale?: string;

  /** SHA-256 hash of the requester IP — kept for abuse investigation, never the raw IP */
  @Prop()
  ipHash?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  notifiedAt?: Date;

  @Prop()
  respondedAt?: Date;

  @Prop()
  closedAt?: Date;
}

export const LiveHandoffRequestSchema = SchemaFactory.createForClass(LiveHandoffRequest);

// Data retention: drop the record 24h after creation regardless of outcome,
// mirroring the TTL already used on ChatSession.lastActivity.
LiveHandoffRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
