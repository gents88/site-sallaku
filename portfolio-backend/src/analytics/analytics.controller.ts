import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // Simple per-IP rate limiter: max 30 page-view pings per minute
  private readonly rateMap = new Map<string, number[]>();

  private checkRateLimit(req: Request): void {
    const ip: string =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const now = Date.now();
    const cutoff = now - 60_000;
    const hits = (this.rateMap.get(ip) ?? []).filter(t => t >= cutoff);
    if (hits.length >= 30) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    hits.push(now);
    this.rateMap.set(ip, hits);
  }

  @Post('page-view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track a public page view' })
  trackPageView(@Body() dto: TrackPageViewDto, @Req() req: Request) {
    this.checkRateLimit(req);
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