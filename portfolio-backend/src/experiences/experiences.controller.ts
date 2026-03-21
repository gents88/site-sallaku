import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExperiencesService } from './experiences.service';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';

@ApiTags('Experiences')
@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly experiencesService: ExperiencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all experiences (public)' })
  findAll() { return this.experiencesService.findAll(); }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single experience (public)' })
  findOne(@Param('id') id: string) { return this.experiencesService.findOne(id); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  create(@Body() dto: CreateExperienceDto) { return this.experiencesService.create(dto); }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  update(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.experiencesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  remove(@Param('id') id: string) { return this.experiencesService.remove(id); }
}
