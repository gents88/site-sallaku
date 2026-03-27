import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { AboutModule } from './about/about.module';
import { BlogModule } from './blog/blog.module';
import { ContactModule } from './contact/contact.module';
import { MailModule } from './mail/mail.module';
import { StatsModule } from './stats/stats.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SystemModule } from './system/system.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { CronModule } from './cron/cron.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    // ── Config (global) ───────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // ── Rate limiting (global default: 60 req / 60 s per IP) ─────────────
    // Individual endpoints may override with @Throttle({ default: { limit, ttl } })
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => [
        {
          ttl: cfg.get<number>('THROTTLE_TTL', 60000),
          limit: cfg.get<number>('THROTTLE_LIMIT', 60),
        },
      ],
      inject: [ConfigService],
    }),
    // ── Scheduled tasks ───────────────────────────────────────────
    ScheduleModule.forRoot(),
    // ── MongoDB ───────────────────────────────────────
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        uri: cfg.get<string>('MONGODB_URI', 'mongodb://localhost:27017/portfolio'),
      }),
      inject: [ConfigService],
    }),

    // ── Shared utilities (global: CacheService etc.) ──
    CommonModule,

    // ── Feature modules ───────────────────────────────
    AuthModule,
    UsersModule,
    ProjectsModule,
    ExperiencesModule,
    AboutModule,
    BlogModule,
    ContactModule,
    AnalyticsModule,
    MailModule,
    StatsModule,
    SystemModule,
    ChatbotModule,
    CronModule,
    AuditModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally — all endpoints are rate-limited by default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
