import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AppSettingDocument = AppSetting & Document;

/** Impostazioni runtime chiave → valore (oggi solo 'feature-flags'). */
@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSetting {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  value: Record<string, unknown>;

  @Prop({ default: '' })
  updatedBy: string;
}

export const AppSettingSchema = SchemaFactory.createForClass(AppSetting);
