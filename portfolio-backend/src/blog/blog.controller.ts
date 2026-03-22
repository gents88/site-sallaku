import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus, UploadedFile,
  UseInterceptors, ParseFilePipeBuilder, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { GenerateBlogFromPdfDto } from './dto/generate-blog-from-pdf.dto';
import { BlogGenerationService } from './services/blog-generation.service';
import { BLOG_LANGUAGES, MAX_PDF_UPLOAD_SIZE } from './blog.constants';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly blogGenerationService: BlogGenerationService,
  ) {}

  // ── Public ──────────────────────────────────────────
  @Get('posts')
  @UseInterceptors(new CacheControlInterceptor(120, 60))
  @ApiOperation({ summary: 'Get published posts (public, optional tag filter)' })
  @ApiQuery({ name: 'tag', required: false })
  findPublished(@Query('tag') tag?: string) {
    return this.blogService.findPublished(tag);
  }

  @Get('posts/:slug')
  @UseInterceptors(new CacheControlInterceptor(120, 60))
  @ApiOperation({ summary: 'Get published post by slug (public)' })
  findBySlug(@Param('slug') slug: string) {
    return this.blogService.findBySlug(slug);
  }

  @Post('posts/:slug/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Increment view count for a published post (public, fire-and-forget)' })
  async trackView(@Param('slug') slug: string) {
    await this.blogService.incrementViewCount(slug);
  }

  // ── Admin ───────────────────────────────────────────
  @Get('admin/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all posts including drafts (admin)' })
  findAll() { return this.blogService.findAll(); }

  @Get('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  findOne(@Param('id') id: string) { return this.blogService.findOne(id); }

  @Post('admin/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  create(@Body() dto: CreatePostDto) { return this.blogService.create(dto); }

  @Post('admin/posts/generate-from-pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'language'],
      properties: {
        file: { type: 'string', format: 'binary' },
        language: { type: 'string', enum: [...BLOG_LANGUAGES] },
        context: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  generateFromPdf(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_PDF_UPLOAD_SIZE })
        .addFileTypeValidator({ fileType: /(pdf)$/i })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Body() dto: GenerateBlogFromPdfDto,
  ) {
    const fileName = file.originalname.toLowerCase();
    if (!file.mimetype.includes('pdf') && !fileName.endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are allowed.');
    }

    return this.blogGenerationService.generateFromPdf(file, dto);
  }

  @Put('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.blogService.update(id, dto);
  }

  @Delete('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) { return this.blogService.remove(id); }
}
