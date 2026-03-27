import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 60 })
  name: string;

  @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
  email?: string;

  @Prop({ select: false })
  passwordHash?: string;

  /** E.164 phone number for OTP login, e.g. +12025551234 */
  @Prop({ unique: true, sparse: true, trim: true })
  phone?: string;

  @Prop({ default: 'user', enum: ['admin', 'user'] })
  role: string;

  /** Bcrypt hash of the latest issued refresh token — null when logged out */
  @Prop({ select: false, default: null })
  refreshTokenHash?: string | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

