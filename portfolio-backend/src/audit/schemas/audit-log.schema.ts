import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

/**
 * Persistent record of every admin write-action (create / update / delete).
 * Kept for 90 days via a TTL index.
 */
@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  /** The admin user who performed the action */
  @Prop({ required: true, index: true })
  actorId: string;

  @Prop({ required: true })
  actorEmail: string;

  /** HTTP method that describes the operation (POST, PUT, PATCH, DELETE) */
  @Prop({ required: true })
  method: string;

  /** API path, e.g. /api/v1/blog/posts/abc123 */
  @Prop({ required: true })
  path: string;

  /** Resource type derived from path, e.g. "blog", "projects" */
  @Prop({ default: '' })
  resource: string;

  /** Short human-readable description */
  @Prop({ default: '' })
  description: string;

  /** HTTP status code returned */
  @Prop({ default: 0 })
  statusCode: number;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
// Efficient admin queries: by actor, by resource, by time
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });
// TTL: auto-delete after 90 days
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
