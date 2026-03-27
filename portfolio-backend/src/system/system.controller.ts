import { Controller, Get, UseGuards } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { MailService } from '../mail/mail.service';

interface VersionInfo {
  name: string;
  version: string;
}

interface CronJobStatus {
  name: string;
  nextRun: string | null;
  running: boolean;
}

interface OperationsInfo {
  uptimeSeconds: number;
  memoryRssMb: number;
  nodeVersion: string;
  mail: {
    configured: boolean;
    provider: 'resend' | 'smtp' | 'none';
    smtpUser: string | null;
  };
  cronJobs: CronJobStatus[];
}

@Controller('system')
export class SystemController {
  private readonly startedAt = new Date().toISOString();
  private readonly packageInfo = this.readPackageInfo();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly mailService: MailService,
  ) {}

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

  @Get('ops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Operational health snapshot (admin only)' })
  ops(): OperationsInfo {
    const cronJobNames = ['daily-summary', 'monthly-analytics-reset'];

    const cronJobs = cronJobNames.map((name): CronJobStatus => {
      try {
        const job = this.schedulerRegistry.getCronJob(name);
        return {
          name,
          nextRun: job.nextDate()?.toJSDate?.().toISOString?.() ?? null,
          running: job.isActive,
        };
      } catch {
        return {
          name,
          nextRun: null,
          running: false,
        };
      }
    });

    const memoryRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

    return {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb,
      nodeVersion: process.version,
      mail: this.mailService.getStatus(),
      cronJobs,
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