import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsTrackingService } from './services/analytics-tracking.service';
import { AnalyticsQueryService } from './services/analytics-query.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { SearchConsoleService } from './search-console.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { TrackPageLeaveDto } from './dto/track-page-leave.dto';
import { TrackClickEventDto } from './dto/track-click-event.dto';
import { AdminTrackingBypassInterceptor } from './interceptors/admin-tracking-bypass.interceptor';
import { MonthsQueryDto } from './dto/months-query.dto';
import { ClickStatsQueryDto } from './dto/click-stats-query.dto';
import { LimitOnlyDto } from '../common/dto/pagination.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly tracking: AnalyticsTrackingService,
    private readonly query: AnalyticsQueryService,
    private readonly exportService: AnalyticsExportService,
    private readonly searchConsoleService: SearchConsoleService,
  ) {}

  @Post('page-view')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AdminTrackingBypassInterceptor)
  @ApiOperation({ summary: 'Track a public page view (silently skipped for admins)' })
  trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    // Rate limiting is handled by the global ThrottlerGuard
    return this.tracking.trackPageView(dto, req);
  }

  @Post('page-leave')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AdminTrackingBypassInterceptor)
  @ApiOperation({ summary: 'Attach dwell time to a previously tracked page view' })
  trackPageLeave(@Body() dto: TrackPageLeaveDto) {
    return this.tracking.trackPageLeave(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get combined monthly + total analytics stats (admin only)' })
  getAnalyticsStats() {
    return this.query.getAnalyticsStats();
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Manually trigger monthly analytics reset (admin only)' })
  resetMonthlyStats() {
    return this.exportService.resetMonthlyStats(true /* force */);
  }

  @Get('top-pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get top visited pages (admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  getTopPages(@Query() { limit }: LimitOnlyDto) {
    return this.query.getTopPages(limit ?? 10);
  }

  @Get('monthly-history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get monthly history snapshots (admin only)' })
  @ApiQuery({ name: 'months', required: false })
  getMonthlyHistory(@Query() { months }: MonthsQueryDto) {
    return this.exportService.getMonthlyHistory(months ?? 6);
  }

  @Get('advanced')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get advanced analytics breakdown (admin only)' })
  getAdvancedAnalytics() {
    return this.query.getAdvancedAnalytics();
  }

  @Get('search-console')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Google Search Console summary – last 28 days (admin only)' })
  getSearchConsoleSummary() {
    return this.searchConsoleService.getSummary();
  }

  @Get('export/csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Export page-view data as CSV (admin only)' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date (default: 30 days ago)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date (default: today)' })
  async exportCsv(
    @Res() res: Response,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ) {
    const to = toStr ? new Date(toStr) : new Date();
    const from = fromStr
      ? new Date(fromStr)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days

    to.setHours(23, 59, 59, 999);
    from.setHours(0, 0, 0, 0);

    const csv = await this.exportService.exportCsv(from, to);
    const filename = `analytics_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  // ─── Click event tracking ────────────────────────────────────────────────

  @Post('click-event')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AdminTrackingBypassInterceptor)
  @ApiOperation({ summary: 'Track a click / interaction event (public, silently skipped for admins)' })
  trackClickEvent(@Body() dto: TrackClickEventDto, @Req() req: Request) {
    return this.tracking.trackClickEvent(dto, req);
  }

  @Get('click-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get aggregated click stats: top labels, event types, destinations (admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'eventType', required: false, description: "Restringe a una famiglia di eventi, es. 'sidebar' o 'sidebar_nav'" })
  getClickStats(@Query() { limit, eventType }: ClickStatsQueryDto) {
    return this.query.getClickStats(limit ?? 20, eventType);
  }
}
