import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TestimonialDocument = Testimonial & Document;

@Schema({ timestamps: true, collection: 'testimonials' })
export class Testimonial {
  @Prop({ required: true, trim: true, maxlength: 100 })
  authorName: string;

  @Prop({ trim: true, maxlength: 150 })
  role?: string;

  @Prop({ trim: true, maxlength: 500 })
  companyUrl?: string;

  @Prop({
    trim: true,
    lowercase: true,
    maxlength: 255,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email?: string;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ required: true, minlength: 10, maxlength: 600 })
  content: string;

  @Prop({ trim: true, maxlength: 500 })
  avatarUrl?: string;

  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ default: false })
  isSpam: boolean;

  @Prop({ default: 0 })
  spamScore: number;

  @Prop({ default: false })
  featured: boolean;

  @Prop({ default: '' })
  userIp?: string;

  @Prop({ type: Date, index: true })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const TestimonialSchema = SchemaFactory.createForClass(Testimonial);
TestimonialSchema.index({ isApproved: 1, isSpam: 1, createdAt: -1 });
TestimonialSchema.index({ isApproved: 1, featured: 1, createdAt: -1 });
