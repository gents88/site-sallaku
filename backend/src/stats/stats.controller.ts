import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { AdminDashboardStatsResponse, AdminOverviewResponse, AdminOverviewService, NotificationSummary } from './admin-overview.service';

@ApiTags('Stats')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('stats')
export class StatsController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: 'Get aggregate admin dashboard stats' })
  getStats(): Promise<AdminDashboardStatsResponse> {
    return this.overview.coreStats();
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Pending-action counters for the admin notification bell' })
  getNotifications(): Promise<NotificationSummary> {
    return this.overview.notificationSummary();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Whole admin dashboard snapshot in one call (30s cache, ?fresh=1 to bypass)' })
  @ApiQuery({ name: 'fresh', required: false, type: Boolean })
  @ApiQuery({ name: 'sections', required: false, description: 'Comma-separated subset (e.g. core,liveHandoffs): computes only those, uncached' })
  getOverview(@Query('fresh') fresh?: string, @Query('sections') sections?: string): Promise<AdminOverviewResponse> {
    const keys = (sections ?? '').split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30);
    if (keys.length) return this.overview.getSections(keys);
    return this.overview.getOverview(fresh === '1' || fresh === 'true');
  }
}
