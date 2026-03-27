import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SystemController } from './system.controller';

@Module({
  imports: [ScheduleModule],
  controllers: [SystemController],
})
export class SystemModule {}