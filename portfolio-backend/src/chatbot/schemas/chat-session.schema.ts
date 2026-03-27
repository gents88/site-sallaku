import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({
    type: [
      {
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: () => new Date() },
      },
    ],
    default: [],
  })
  messages: ChatMessage[];

  /** TTL: sessions expire after 24 hours of inactivity */
  @Prop({ default: () => new Date(), expires: '24h' })
  lastActivity: Date;
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
