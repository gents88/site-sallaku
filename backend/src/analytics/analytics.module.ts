import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SearchConsoleService } from './search-console.service';
import { PageView, PageViewSchema } from './schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsSchema } from './schemas/analytics-stats.schema';
import { MonthlyHistory, MonthlyHistorySchema } from './schemas/monthly-history.schema';
import { ClickEvent, ClickEventSchema } from './schemas/click-event.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PageView.name, schema: PageViewSchema },
      { name: AnalyticsStats.name, schema: AnalyticsStatsSchema },
      { name: MonthlyHistory.name, schema: MonthlyHistorySchema },
      { name: ClickEvent.name, schema: ClickEventSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SearchConsoleService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}