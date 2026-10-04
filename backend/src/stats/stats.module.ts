import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { AdminOverviewService } from './admin-overview.service';
import { UsersModule } from '../users/users.module';
import { ContactModule } from '../contact/contact.module';
import { BlogModule } from '../blog/blog.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ProjectsModule } from '../projects/projects.module';
import { ExperiencesModule } from '../experiences/experiences.module';
import { AuditModule } from '../audit/audit.module';
import { ChatbotModule } from '../chatbot/chatbot.module';
import { ConsentModule } from '../consent/consent.module';
import { LiveHandoffModule } from '../live-handoff/live-handoff.module';
import { SystemModule } from '../system/system.module';
import { TestimonialsModule } from '../testimonials/testimonials.module';
import { NotesModule } from '../notes/notes.module';

@Module({
  imports: [
    UsersModule, ContactModule, BlogModule, AnalyticsModule, ProjectsModule, ExperiencesModule,
    AuditModule, ChatbotModule, ConsentModule, LiveHandoffModule, SystemModule, TestimonialsModule, NotesModule,
  ],
  controllers: [StatsController],
  providers: [AdminOverviewService],
})
export class StatsModule {}
