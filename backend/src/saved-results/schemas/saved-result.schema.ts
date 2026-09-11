import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SavedResultDocument = SavedResult & Document;

export const SAVED_RESULT_TOOL_TYPES = [
  'pdf-translate',
  'ai-ppt',
  'ai-formatter',
  'pdf-summary',
  'ocr',
] as const;

export type SavedResultToolType = (typeof SAVED_RESULT_TOOL_TYPES)[number];

@Schema({ timestamps: true, collection: 'saved_results' })
export class SavedResult {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: SAVED_RESULT_TOOL_TYPES })
  toolType: SavedResultToolType;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const SavedResultSchema = SchemaFactory.createForClass(SavedResult);
SavedResultSchema.index({ userId: 1, createdAt: -1 });
