import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { OperationsInfo, SystemInfoService } from './system-info.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemInfo: SystemInfoService) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check (public)' })
  health() {
    return this.systemInfo.health();
  }

  @Get('version')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Detailed version + infrastructure info (admin only)' })
  version() {
    return this.systemInfo.version();
  }

  @Get('ops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Operational health snapshot (admin only)' })
  ops(): OperationsInfo {
    return this.systemInfo.ops();
  }
}
