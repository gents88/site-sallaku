import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PageView, PageViewSchema } from './schemas/page-view.schema';
import { AnalyticsStats, AnalyticsStatsSchema } from './schemas/analytics-stats.schema';
import { MonthlyHistory, MonthlyHistorySchema } from './schemas/monthly-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PageView.name, schema: PageViewSchema },
      { name: AnalyticsStats.name, schema: AnalyticsStatsSchema },
      { name: MonthlyHistory.name, schema: MonthlyHistorySchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}