import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role, Roles } from '../auth/decorators/roles.decorator';
import { AdminSearchService } from './admin-search.service';

export class AdminSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}

@ApiTags('Admin search')
@Controller('admin/search')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@ApiBearerAuth('access-token')
export class AdminSearchController {
  constructor(private readonly service: AdminSearchService) {}

  // Chiamata a ogni pausa di digitazione nella palette: budget più largo del default.
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @ApiOperation({ summary: 'Cerca in contatti, utenti, bozze e note (admin)' })
  @ApiQuery({ name: 'q', required: true })
  search(@Query() { q }: AdminSearchQueryDto) {
    return this.service.search(q);
  }
}
