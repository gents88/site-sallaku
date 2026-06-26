import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ── POST /ai/summarize-file ──────────────────────────────────────────
  @Post('summarize-file')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Summarise a PDF, DOCX, or TXT file using AI' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async summarizeFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^(application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/ }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body('lang') lang: string = 'en',
    @Body('mode') mode: string = 'short',
  ) {
    return this.aiService.summarizeFile(file, lang || 'en', mode || 'short');
  }

  // ── POST /ai/format-text ─────────────────────────────────────────────
  @Post('format-text')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Format raw text into a structured Markdown document using AI' })
  async formatText(
    @Body() body: { text: string; docType?: string },
  ) {
    if (!body.text || body.text.trim().length < 10) {
      throw new BadRequestException('text must be at least 10 characters');
    }
    return this.aiService.formatText(body.text, body.docType || 'general');
  }

  // ── POST /ai/generate-ppt ────────────────────────────────────────────
  @Post('generate-ppt')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Generate a presentation from a topic using AI' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async generatePpt(
    @Body('topic') topic: string,
    @Body('slideCount') slideCount: string,
    @Body('style') style: string = 'modern',
    @UploadedFile() contextFile?: Express.Multer.File,
  ) {
    if (!topic || topic.trim().length < 3) {
      throw new BadRequestException('topic must be at least 3 characters');
    }
    if (topic.trim().length > 500) {
      throw new BadRequestException('topic must be at most 500 characters');
    }
    const count = Math.min(Math.max(parseInt(slideCount, 10) || 10, 3), 20);
    return this.aiService.generatePpt(topic.trim(), count, style || 'modern', contextFile);
  }

  // ── POST /ai/translate-pdf ───────────────────────────────────────────
  @Post('translate-pdf')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Translate a PDF/DOCX/TXT document to another language' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async translatePdf(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^(application\/pdf|text\/plain|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/ }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body('targetLanguage') targetLanguage: string = 'english',
    @Body('highFidelity') highFidelity: string = 'true',
  ) {
    return this.aiService.translatePdf(file, targetLanguage || 'english', highFidelity !== 'false');
  }
}
