import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemController } from './system.controller';
import { SystemInfoService } from './system-info.service';
import { AuditModule } from '../audit/audit.module';
import { ServerHealthService } from './server-health.service';

@Module({
  imports: [ScheduleModule, AuditModule],
  controllers: [SystemController],
  providers: [SystemInfoService, ServerHealthService],
  exports: [SystemInfoService, ServerHealthService],
})
export class SystemModule {}
