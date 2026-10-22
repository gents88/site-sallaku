import { Controller, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { clientContext } from './client-context';
import { SecuritySessionsService } from './security-sessions.service';

@ApiTags('Security')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('security')
export class SecurityController {
  constructor(private readonly sessions: SecuritySessionsService) {}

  @Post('sessions/:userId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a user session: the refresh token stops working (admin; not self)' })
  revoke(@Req() req: Request & { user: { _id: unknown } }, @Param('userId', ParseMongoIdPipe) userId: string) {
    return this.sessions.revoke(String(req.user._id), userId, clientContext(req));
  }
}
