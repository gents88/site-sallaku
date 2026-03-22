import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AboutService } from './about.service';
import { UpdateAboutDto } from './dto/update-about.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';

@ApiTags('About')
@Controller('about')
export class AboutController {
  constructor(private readonly aboutService: AboutService) {}

  @Get()
  @ApiOperation({ summary: 'Get about section (public)' })
  get() { return this.aboutService.get(); }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update about section (admin)' })
  update(@Body() dto: UpdateAboutDto) { return this.aboutService.update(dto); }
}
