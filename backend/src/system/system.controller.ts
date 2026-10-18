import { Body, Controller, Get, Patch, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { OperationsInfo, SystemInfoService } from './system-info.service';
import { SettingsService } from '../common/settings/settings.service';
import { FeatureFlags } from '../common/settings/feature-flags';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';
import { UpdateFlagsDto } from './dto/update-flags.dto';

@Controller('system')
export class SystemController {
  constructor(
    private readonly systemInfo: SystemInfoService,
    private readonly settings: SettingsService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check (public)' })
  health() {
    return this.systemInfo.health();
  }

  @Get('flags')
  @UseInterceptors(new CacheControlInterceptor(30, 30))
  @ApiOperation({ summary: 'Feature flags + maintenance mode (public: the frontend hides what is switched off)' })
  flags(): Promise<FeatureFlags> {
    return this.settings.getFlags();
  }

  @Patch('flags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Switch site features on/off without a deploy (admin only)' })
  updateFlags(@Body() dto: UpdateFlagsDto, @Req() req: { user?: { email?: string } }): Promise<FeatureFlags> {
    return this.settings.updateFlags(dto, req.user?.email ?? '');
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
