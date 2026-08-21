import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus, UploadedFile,
  UseInterceptors, ParseFilePipeBuilder, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BlogService } from './blog.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, Role } from '../auth/decorators/roles.decorator';
import { GenerateBlogFromPdfDto } from './dto/generate-blog-from-pdf.dto';
import { TranslateTextDto } from './dto/translate-text.dto';
import { BlogGenerationService } from './services/blog-generation.service';
import { PdfExtractionService } from './services/pdf-extraction.service';
import { TranslationService } from './services/translation.service';
import { BLOG_LANGUAGES, MAX_PDF_UPLOAD_SIZE } from './blog.constants';
import { CacheControlInterceptor } from '../common/interceptors/cache-control.interceptor';
import { AuditInterceptor } from '../audit/interceptors/audit.interceptor';
import { BlogPublishedQueryDto } from './dto/blog-published-query.dto';
import { PageLimitDto } from '../common/dto/pagination.dto';

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly blogGenerationService: BlogGenerationService,
    private readonly pdfExtractionService: PdfExtractionService,
    private readonly translationService: TranslationService,
  ) {}

  // ── Public ──────────────────────────────────────────
  // Higher throttle than the app-wide default (60/60s): read-only, no auth,
  // already-published public content, no sensitive data involved. The
  // frontend's multilingual prerender build fetches every post × every
  // site language (~200+ requests) in well under a minute from a single
  // IP, which was tripping the default limit and causing some blog pages
  // to prerender as "not found" instead of their real content.
  @Get('posts')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @UseInterceptors(new CacheControlInterceptor(120, 60))
  @ApiOperation({ summary: 'Get published posts (public, optional tag filter, paginated)' })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findPublished(@Query() { tag, page, limit }: BlogPublishedQueryDto) {
    return this.blogService.findPublished(tag, page ?? 1, limit ?? 10);
  }

  @Get('posts/:slug')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
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
  @ApiOperation({ summary: 'Get all posts including drafts (admin), optionally paginated' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(@Query() { page, limit }: PageLimitDto) {
    return this.blogService.findAll(page, limit);
  }

  @Get('admin/posts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  findOne(@Param('id') id: string) { return this.blogService.findOne(id); }

  @Post('admin/posts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @UseInterceptors(AuditInterceptor)
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

  @Post('admin/posts/extract-pdf')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Extract plain text from a PDF (no AI — admin)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  extractPdf(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: MAX_PDF_UPLOAD_SIZE })
        .addFileTypeValidator({ fileType: /(pdf)$/i })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    const fileName = file.originalname.toLowerCase();
    if (!file.mimetype.includes('pdf') && !fileName.endsWith('.pdf')) {
      throw new BadRequestException('Only PDF files are allowed.');
    }
    return this.pdfExtractionService.extract(file);
  }

  @Post('admin/translate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Translate text via MyMemory (admin)' })
  async translateText(@Body() dto: TranslateTextDto): Promise<{ translatedText: string }> {
    const translatedText = await this.translationService.translate(dto.text, dto.from, dto.to);
    return { translatedText };
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
