import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Consent, ConsentSchema } from './consent.schema';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Consent.name, schema: ConsentSchema }])],
  providers: [ConsentService],
  controllers: [ConsentController],
  exports: [ConsentService],
})
export class ConsentModule {}
