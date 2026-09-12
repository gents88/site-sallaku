import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { SpamDetectionService } from './services/spam-detection.service';
import { AiProviderService } from './services/ai-provider.service';
import { AiQuotaService } from './services/ai-quota.service';
import { TurnstileService } from './services/turnstile.service';

@Global()
@Module({
  providers: [CacheService, SpamDetectionService, AiProviderService, AiQuotaService, TurnstileService],
  exports: [CacheService, SpamDetectionService, AiProviderService, AiQuotaService, TurnstileService],
})
export class CommonModule {}
