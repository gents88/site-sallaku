import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemController } from './system.controller';
import { SystemInfoService } from './system-info.service';

@Module({
  imports: [ScheduleModule],
  controllers: [SystemController],
  providers: [SystemInfoService],
  exports: [SystemInfoService],
})
export class SystemModule {}