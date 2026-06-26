import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { DailySummaryService } from './daily-summary.service';

@ApiTags('Cron')
@Controller('admin/cron')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiBearerAuth('access-token')
export class CronController {
  constructor(private readonly dailySummary: DailySummaryService) {}

  @Post('trigger-daily-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger the daily summary email (admin only)' })
  triggerDailySummary(): Promise<{ success: boolean; message: string }> {
    return this.dailySummary.runNow();
  }
}
