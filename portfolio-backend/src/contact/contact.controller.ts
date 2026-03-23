import { Controller, Post, Body, HttpCode, HttpStatus, Patch, Param, UseGuards, Delete, Req, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
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

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a contact message (public)' })
  sendMessage(@Req() req: Request, @Body() dto: ContactDto) {
    // IP is already rate-limited by the global ThrottlerGuard (8 req / 60 s)
    const ip: string =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

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

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List contact messages with pagination (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'unreadOnly', required: false, type: Boolean })
  findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    return this.contactService.findPaginated({ page: +page, limit: +limit, unreadOnly });
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
