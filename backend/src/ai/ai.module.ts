import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
