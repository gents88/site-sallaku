import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NoteDocument = Note & Document;

@Schema({ timestamps: true, collection: 'notes' })
export class Note {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  articleId: Types.ObjectId;

  @Prop({ trim: true, maxlength: 100 })
  name?: string;

  @Prop({
    trim: true,
    lowercase: true,
    maxlength: 255,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email?: string;

  @Prop({ required: true, minlength: 3, maxlength: 1000 })
  content: string;

  @Prop({ default: true })
  isApproved: boolean;

  @Prop({ default: false })
  isSpam: boolean;

  @Prop({ type: Date, index: true })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;

  @Prop({ default: '' })
  userIp?: string;

  @Prop({ default: 0 })
  spamScore: number;
}

export const NoteSchema = SchemaFactory.createForClass(Note);
NoteSchema.index({ articleId: 1, createdAt: -1 });
NoteSchema.index({ articleId: 1, isApproved: 1, createdAt: -1 });
