import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChatSessionDocument = ChatSession & Document;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: Date;
  /** true when this assistant reply came from the static canned fallback (AI call failed/unavailable) */
  usedFallback?: boolean;
}

@Schema({ timestamps: true })
export class ChatSession {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  @Prop({
    type: [
      {
        role: { type: String, enum: ['user', 'assistant', 'agent'], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: () => new Date() },
        usedFallback: { type: Boolean, default: false },
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
