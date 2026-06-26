import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get recent audit log entries (admin only)' })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'resource', required: false, type: String })
  @ApiQuery({ name: 'actorId',  required: false, type: String })
  findRecent(
    @Query('limit')    limit    = 50,
    @Query('resource') resource?: string,
    @Query('actorId')  actorId?: string,
  ) {
    return this.auditService.findRecent({ limit: +limit, resource, actorId });
  }
}
