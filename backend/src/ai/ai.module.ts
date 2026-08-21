import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ConversionModule } from '../conversion/conversion.module';
import { OcrModule } from '../ocr/ocr.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    ConversionModule,
    OcrModule,
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
