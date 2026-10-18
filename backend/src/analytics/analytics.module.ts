import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsTrackingService } from './services/analytics-tracking.service';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { SearchConsoleService } from './search-console.service';
import { AdminTrackingBypassInterceptor } from './interceptors/admin-tracking-bypass.interceptor';
import { PageView, PageViewSchema } from './schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsSchema } from './schemas/analytics-stats.schema';
import { MonthlyHistory, MonthlyHistorySchema } from './schemas/monthly-history.schema';
import { ClickEvent, ClickEventSchema } from './schemas/click-event.schema';
import { NotFoundHit, NotFoundHitSchema } from './not-found/not-found-hit.schema';
import { NotFoundService } from './not-found/not-found.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule, // provides the configured JwtModule used by AdminTrackingBypassInterceptor
    MongooseModule.forFeature([
      { name: PageView.name, schema: PageViewSchema },
      { name: AnalyticsStats.name, schema: AnalyticsStatsSchema },
      { name: MonthlyHistory.name, schema: MonthlyHistorySchema },
      { name: ClickEvent.name, schema: ClickEventSchema },
      { name: NotFoundHit.name, schema: NotFoundHitSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsTrackingService,
    AnalyticsQueryService,
    AnalyticsExportService,
    SearchConsoleService,
    AdminTrackingBypassInterceptor,
    NotFoundService,
  ],
  exports: [AnalyticsTrackingService, AnalyticsQueryService, AnalyticsExportService, SearchConsoleService, NotFoundService],
})
export class AnalyticsModule {}