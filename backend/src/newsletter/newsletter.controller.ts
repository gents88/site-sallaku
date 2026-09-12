import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { NewsletterAdminQueryDto } from './dto/newsletter-admin-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { clientIp } from '../common/utils/request-ip.util';

@ApiTags('Newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Subscribe to the newsletter (public, double opt-in)' })
  subscribe(@Req() req: Request, @Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto, clientIp(req));
  }

  @Get('confirm')
  @ApiOperation({ summary: 'Confirm a pending subscription (public)' })
  @ApiQuery({ name: 'token', required: true })
  confirm(@Query('token') token: string) {
    return this.newsletterService.confirm(token);
  }

  @Get('unsubscribe')
  @ApiOperation({ summary: 'Unsubscribe (public, token from the email footer)' })
  @ApiQuery({ name: 'token', required: true })
  unsubscribe(@Query('token') token: string) {
    return this.newsletterService.unsubscribe(token);
  }

  @Get('admin/subscribers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List newsletter subscribers with pagination (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'confirmed', 'unsubscribed'] })
  findAll(@Query() { page, limit, status }: NewsletterAdminQueryDto) {
    return this.newsletterService.findPaginated(page ?? 1, limit ?? 20, status);
  }

  @Get('admin/counts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Subscriber counts by status (admin)' })
  counts() {
    return this.newsletterService.counts();
  }

  @Get('admin/export')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Export subscribers as CSV (admin)' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.newsletterService.exportCsv();
    const filename = `newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Delete('admin/subscribers/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove a subscriber (admin)' })
  remove(@Param('id') id: string) {
    return this.newsletterService.remove(id);
  }
}
