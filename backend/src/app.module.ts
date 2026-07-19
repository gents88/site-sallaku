import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor } from './common/interceptors/cache.interceptor';
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
import { ConsentModule } from './consent/consent.module';
import { AiModule } from './ai/ai.module';
import { ConversionModule } from './conversion/conversion.module';
import { OcrModule } from './ocr/ocr.module';

@Module({
  imports: [
    // ── Config (global) ───────────────────────────────
    // Priority: .env.<NODE_ENV> → .env (fallback / test)
    // NODE_ENV: dev | uat | prod | undefined → .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
    }),

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

    // ── Caching (in-memory by default, upgradeable to Redis) ─────
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        ttl: cfg.get<number>('CACHE_TTL', 60 * 1000), // default 60 seconds
        max: cfg.get<number>('CACHE_MAX_ITEMS', 100),
        isGlobal: true,
      }),
      inject: [ConfigService],
    }),

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
    ConsentModule,
    AiModule,
    ConversionModule,
    OcrModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally — all endpoints are rate-limited by default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Apply CacheInterceptor globally — automatically caches GET responses
    { provide: APP_INTERCEPTOR, useClass: CacheInterceptor },
  ],
})
export class AppModule {}
