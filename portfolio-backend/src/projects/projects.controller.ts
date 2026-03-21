import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ── Public ───────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Get all projects (public)' })
  findAll() {
    return this.projectsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single project (public)' })
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  // ── Admin-only ───────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create project (admin)' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update project (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete project (admin)' })
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
