import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AboutDocument = About & Document;

@Schema({ timestamps: true, collection: 'about' })
export class About {
  @Prop({ required: true })
  headline: string;

  @Prop({ required: true })
  bio: string;

  @Prop({ default: '' })
  location: string;

  @Prop({ default: '' })
  avatarUrl: string;

  @Prop({ default: '' })
  resumeUrl: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  @Prop({
    type: {
      github: String,
      linkedin: String,
      twitter: String,
      email: String,
    },
    default: {},
  })
  socials: {
    github?: string;
    linkedin?: string;
    twitter?: string;
    email?: string;
  };
}

export const AboutSchema = SchemaFactory.createForClass(About);
