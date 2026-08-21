import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { ConsentHistoryQueryDto } from './dto/consent-history-query.dto';

@Controller('consent')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Post()
  async create(@Body() dto: CreateConsentDto) {
    return this.consentService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('stats')
  async stats() {
    return this.consentService.stats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @Get('history')
  async history(@Query() { limit, skip }: ConsentHistoryQueryDto) {
    return this.consentService.history(limit ?? 100, skip ?? 0);
  }
}
