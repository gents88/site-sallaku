import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('page-view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track a public page view' })
  trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    return this.analyticsService.trackPageView(dto, req);
  }

  @Get('advanced')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get advanced analytics breakdown (admin only)' })
  getAdvancedAnalytics() {
    return this.analyticsService.getAdvancedAnalytics();
  }
}