import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';

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
  async history(@Query('limit') limit = '100', @Query('skip') skip = '0') {
    const l = Math.min(1000, parseInt(limit as string, 10) || 100);
    const s = parseInt(skip as string, 10) || 0;
    return this.consentService.history(l, s);
  }
}
