import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { SearchConsoleService } from './search-console.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { TrackPageLeaveDto } from './dto/track-page-leave.dto';
import { TrackClickEventDto } from './dto/track-click-event.dto';
import { AdminTrackingBypassInterceptor } from './interceptors/admin-tracking-bypass.interceptor';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly searchConsoleService: SearchConsoleService,
  ) {}

  @Post('page-view')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AdminTrackingBypassInterceptor)
  @ApiOperation({ summary: 'Track a public page view (silently skipped for admins)' })
  trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    // Rate limiting is handled by the global ThrottlerGuard
    return this.analyticsService.trackPageView(dto, req);
  }

  @Post('page-leave')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(AdminTrackingBypassInterceptor)
  @ApiOperation({ summary: 'Attach dwell time to a previously tracked page view' })
  trackPageLeave(@Body() dto: TrackPageLeaveDto) {
    return this.analyticsService.trackPageLeave(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get combined monthly + total analytics stats (admin only)' })
  getAnalyticsStats() {
    return this.analyticsService.getAnalyticsStats();
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Manually trigger monthly analytics reset (admin only)' })
  resetMonthlyStats() {
    return this.analyticsService.resetMonthlyStats(true /* force */);
  }

  @Get('top-pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get top visited pages (admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  getTopPages(@Query('limit') limit?: string) {
    return this.analyticsService.getTopPages(limit ? parseInt(limit, 10) : 10);
  }

  @Get('monthly-history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get monthly history snapshots (admin only)' })
  @ApiQuery({ name: 'months', required: false })
  getMonthlyHistory(@Query('months') months?: string) {
    return this.analyticsService.getMonthlyHistory(months ? parseInt(months, 10) : 6);
  }

  @Get('advanced')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get advanced analytics breakdown (admin only)' })
  getAdvancedAnalytics() {
    return this.analyticsService.getAdvancedAnalytics();
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

    const csv = await this.analyticsService.exportCsv(from, to);
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
    return this.analyticsService.trackClickEvent(dto, req);
  }

  @Get('click-stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get aggregated click stats: top labels, event types, destinations (admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  getClickStats(@Query('limit') limit?: string) {
    return this.analyticsService.getClickStats(limit ? parseInt(limit, 10) : 20);
  }
}
