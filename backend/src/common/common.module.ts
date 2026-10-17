import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CacheService } from './services/cache.service';
import { SpamDetectionService } from './services/spam-detection.service';
import { AiProviderService } from './services/ai-provider.service';
import { AiQuotaService } from './services/ai-quota.service';
import { TurnstileService } from './services/turnstile.service';
import { AdminEventsService } from './services/admin-events.service';
import { SettingsService } from './settings/settings.service';
import { FeatureFlagGuard } from './settings/require-feature.decorator';
import { AppSetting, AppSettingSchema } from './settings/app-setting.schema';
import { AiUsageService } from './services/ai-usage.service';
import { AiUsageDay, AiUsageDaySchema } from './services/ai-usage.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppSetting.name, schema: AppSettingSchema },
      { name: AiUsageDay.name, schema: AiUsageDaySchema },
    ]),
  ],
  providers: [CacheService, SpamDetectionService, AiProviderService, AiQuotaService, TurnstileService, AdminEventsService, SettingsService, FeatureFlagGuard, AiUsageService],
  exports: [CacheService, SpamDetectionService, AiProviderService, AiQuotaService, TurnstileService, AdminEventsService, SettingsService, FeatureFlagGuard, AiUsageService],
})
export class CommonModule {}
