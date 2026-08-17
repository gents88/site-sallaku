import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { SpamDetectionService } from './services/spam-detection.service';

@Global()
@Module({
  providers: [CacheService, SpamDetectionService],
  exports: [CacheService, SpamDetectionService],
})
export class CommonModule {}
