import { Controller, Get, UseGuards } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';

interface VersionInfo {
  name: string;
  version: string;
}

@Controller('system')
export class SystemController {
  private readonly startedAt = new Date().toISOString();
  private readonly packageInfo = this.readPackageInfo();

  @Get('health')
  @ApiOperation({ summary: 'Liveness check (public)' })
  health() {
    return {
      ok: true,
      service: this.packageInfo.name,
      version: this.packageInfo.version,
      startedAt: this.startedAt,
    };
  }

  @Get('version')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Detailed version + infrastructure info (admin only)' })
  version() {
    return {
      service: this.packageInfo.name,
      version: this.packageInfo.version,
      startedAt: this.startedAt,
      environment: process.env.NODE_ENV || 'development',
      commitSha:
        process.env.RAILWAY_GIT_COMMIT_SHA
        || process.env.VERCEL_GIT_COMMIT_SHA
        || process.env.GIT_COMMIT_SHA
        || null,
      branch:
        process.env.RAILWAY_GIT_BRANCH
        || process.env.VERCEL_GIT_COMMIT_REF
        || process.env.GIT_BRANCH
        || null,
      railway: {
        serviceId: process.env.RAILWAY_SERVICE_ID || null,
        serviceName: process.env.RAILWAY_SERVICE_NAME || null,
        environmentId: process.env.RAILWAY_ENVIRONMENT_ID || null,
        projectId: process.env.RAILWAY_PROJECT_ID || null,
      },
      features: {
        blogAdminPosts: true,
        blogGenerateFromPdf: true,
      },
    };
  }

  private readPackageInfo(): VersionInfo {
    const packageJsonPath = join(process.cwd(), 'package.json');

    if (!existsSync(packageJsonPath)) {
      return { name: 'portfolio-backend', version: 'unknown' };
    }

    try {
      const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Partial<VersionInfo>;
      return {
        name: parsed.name || 'portfolio-backend',
        version: parsed.version || 'unknown',
      };
    } catch {
      return { name: 'portfolio-backend', version: 'unknown' };
    }
  }
}