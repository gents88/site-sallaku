import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { TestimonialsService } from './services/testimonials.service';
import { CreateTestimonialDto } from './dto/create-testimonial.dto';
import { SetFeaturedDto } from './dto/set-featured.dto';
import { TestimonialResponseDto } from './dto/testimonial-response.dto';
import { TestimonialAdminItemDto } from './dto/testimonial-admin-item.dto';
import { TestimonialsAdminQueryDto } from './dto/testimonials-admin-query.dto';
import { SkipLimitDto, LimitOnlyDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';

@ApiTags('Testimonials')
@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonialsService: TestimonialsService) {}

  // ── Admin: moderation list ────────────────────────────────────────────
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List testimonials for moderation (admin only)' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'spam', 'all'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async getAllForAdmin(
    @Query() { status, limit, skip }: TestimonialsAdminQueryDto,
  ): Promise<{ data: TestimonialAdminItemDto[]; total: number }> {
    return this.testimonialsService.getAllForAdmin(status ?? 'pending', limit ?? 50, skip ?? 0);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get testimonials statistics (admin only)' })
  async getStats() {
    return this.testimonialsService.getStats();
  }

  // ── Public: curated featured selection for the homepage teaser ───────
  @Get('featured')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(300, 60))
  @ApiOperation({ summary: 'Get curated featured testimonials (public)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getFeatured(@Query() { limit }: LimitOnlyDto): Promise<TestimonialResponseDto[]> {
    return this.testimonialsService.getFeatured(Math.min(limit ?? 6, 20));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a new testimonial (public, held for moderation)' })
  @ApiResponse({ status: 201, description: 'Testimonial submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or spam detected' })
  async createTestimonial(
    @Body() dto: CreateTestimonialDto,
    @Req() req: any,
  ): Promise<TestimonialResponseDto> {
    const userIp = req.ip || req.connection.remoteAddress;
    return this.testimonialsService.createTestimonial(dto, userIp);
  }

  @Get()
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(60, 30))
  @ApiOperation({ summary: 'Get approved testimonials (public)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  async getApproved(
    @Query() { limit, skip }: SkipLimitDto,
  ): Promise<{ data: TestimonialResponseDto[]; total: number }> {
    return this.testimonialsService.getApproved(limit ?? 20, skip ?? 0);
  }

  @Get(':id/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get single testimonial details (admin only)' })
  async getById(@Param('id') id: string): Promise<TestimonialAdminItemDto> {
    return this.testimonialsService.getById(id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a pending testimonial (admin only)' })
  async approve(@Param('id') id: string): Promise<TestimonialAdminItemDto> {
    return this.testimonialsService.updateApprovalStatus(id, true);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a testimonial (admin only)' })
  async reject(@Param('id') id: string): Promise<TestimonialAdminItemDto> {
    return this.testimonialsService.updateApprovalStatus(id, false);
  }

  @Patch(':id/spam')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark a testimonial as spam (admin only)' })
  async markAsSpam(@Param('id') id: string): Promise<TestimonialAdminItemDto> {
    return this.testimonialsService.markAsSpam(id);
  }

  @Patch(':id/feature')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle whether a testimonial is featured on the homepage (admin only)' })
  async setFeatured(
    @Param('id') id: string,
    @Body() dto: SetFeaturedDto,
  ): Promise<TestimonialAdminItemDto> {
    return this.testimonialsService.setFeatured(id, dto.featured);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a testimonial (admin only)' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.testimonialsService.delete(id);
  }
}
