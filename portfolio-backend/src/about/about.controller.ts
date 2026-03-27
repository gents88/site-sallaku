import { Controller, Get, Put, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AboutService } from './about.service';
import { UpdateAboutDto } from './dto/update-about.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';

@ApiTags('About')
@Controller('about')
export class AboutController {
  constructor(private readonly aboutService: AboutService) {}

  @Get()
  @UseInterceptors(new CacheControlInterceptor(300, 60))
  @ApiOperation({ summary: 'Get about section (public)' })
  get() { return this.aboutService.get(); }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update about section (admin)' })
  update(@Body() dto: UpdateAboutDto) { return this.aboutService.update(dto); }
}
