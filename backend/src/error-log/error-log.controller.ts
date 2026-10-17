import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';
import { ErrorLogService, ServerErrorView } from './error-log.service';

@ApiTags('System')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('system/errors')
export class ErrorLogController {
  constructor(private readonly errors: ErrorLogService) {}

  @Get()
  @ApiOperation({ summary: 'Server errors (5xx) grouped by fingerprint (admin only)' })
  @ApiQuery({ name: 'includeResolved', required: false, type: Boolean })
  list(@Query('includeResolved') includeResolved?: string): Promise<ServerErrorView[]> {
    return this.errors.list(includeResolved === 'true' || includeResolved === '1');
  }

  @Post('resolve-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every open error group as resolved (admin only)' })
  resolveAll() {
    return this.errors.resolveAll();
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark an error group as resolved; it reopens if it happens again (admin only)' })
  resolve(@Param('id', ParseMongoIdPipe) id: string) {
    return this.errors.resolve(id);
  }
}
