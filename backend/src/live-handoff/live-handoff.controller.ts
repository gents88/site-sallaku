import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LiveHandoffService } from './live-handoff.service';
import { CreateLiveHandoffDto } from './dto/live-handoff.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Live Handoff')
@Controller('chatbot')
export class LiveHandoffController {
  constructor(private readonly liveHandoffService: LiveHandoffService) {}

  @Post(':sessionId/live-handoff')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 600_000 } })
  @ApiOperation({ summary: 'Request a live handoff to Gent for this chat session' })
  create(
    @Req() req: any,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateLiveHandoffDto,
  ) {
    const ip: string = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '';
    return this.liveHandoffService.createRequest(sessionId, dto, ip);
  }

  @Get(':sessionId/live-handoff/status')
  @ApiOperation({ summary: 'Poll the current status of a live handoff request (fallback for when the WebSocket is unavailable)' })
  getStatus(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.liveHandoffService.getStatus(sessionId);
  }
}

@ApiTags('Live Handoff Admin')
@Controller('admin/live-handoff')
export class LiveHandoffAdminController {
  constructor(private readonly liveHandoffService: LiveHandoffService) {}

  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List pending live handoff requests (admin only)' })
  listPending() {
    return this.liveHandoffService.listPending();
  }
}
