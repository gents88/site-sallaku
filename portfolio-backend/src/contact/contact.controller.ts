import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, UseGuards, Delete, Req, HttpException, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContactService } from './contact.service';
import { ContactDto, BulkDeleteDto } from './dto/contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import * as geoip from 'geoip-lite';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  // simple in-memory rate limiter (IP => timestamps)
  private rateMap = new Map<string, number[]>();
  private cleanupRateMap() {
    const cutoff = Date.now() - 60 * 1000; // 1 minute window
    for (const [ip, times] of this.rateMap.entries()) {
      const filtered = times.filter(t => t >= cutoff);
      if (filtered.length) this.rateMap.set(ip, filtered);
      else this.rateMap.delete(ip);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a contact message (public)' })
  sendMessage(@Req() req: any, @Body() dto: ContactDto) {
    // basic rate limit: max 8 submissions per minute per IP
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    this.cleanupRateMap();
    const times = this.rateMap.get(ip) ?? [];
    if (times.length >= 8) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    times.push(Date.now());
    this.rateMap.set(ip, times);

    // Resolve geo location from IP (best-effort)
    let location: string | undefined;
    try {
      const geo = geoip.lookup(ip);
      if (geo) {
        location = [geo.city, geo.country].filter(Boolean).join(', ') || undefined;
      }
    } catch { /* ignore geo errors */ }

    return this.contactService.sendMessage(dto, { ip, location });
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Mark contact message as read (admin)' })
  markAsRead(@Param('id') id: string, @Body() body?: { read?: boolean }) {
    return this.contactService.markAsRead(id, body?.read ?? true);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Bulk delete contact messages (admin)' })
  bulkDeleteMessages(@Body() body: BulkDeleteDto) {
    return this.contactService.deleteMany(body.ids);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete contact message (admin)' })
  deleteMessage(@Param('id') id: string) {
    return this.contactService.deleteMessage(id);
  }
}
