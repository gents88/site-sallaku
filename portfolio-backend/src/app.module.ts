import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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

@Module({
  imports: [
    // ── Config (global) ───────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

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
  ],
})
export class AppModule {}
