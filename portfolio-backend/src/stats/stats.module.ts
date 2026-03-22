import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { UsersModule } from '../users/users.module';
import { ContactModule } from '../contact/contact.module';
import { BlogModule } from '../blog/blog.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [UsersModule, ContactModule, BlogModule, AnalyticsModule],
  controllers: [StatsController],
})
export class StatsModule {}
