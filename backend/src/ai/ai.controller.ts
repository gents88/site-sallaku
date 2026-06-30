import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
]);

function validateFile(file: Express.Multer.File | undefined, maxMb: number): Express.Multer.File {
  if (!file) throw new BadRequestException('No file uploaded.');
  if (file.size > maxMb * 1024 * 1024) throw new BadRequestException(`File exceeds ${maxMb} MB limit.`);
  const ext = file.originalname.split('.').pop()?.toLowerCase();
  if (!ALLOWED_MIMES.has(file.mimetype) && !['pdf', 'docx', 'txt'].includes(ext ?? '')) {
    throw new BadRequestException(`File type not allowed: ${file.mimetype}. Supported: PDF, DOCX, TXT.`);
  }
  return file;
}

const upload = (maxMb: number) => FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024 },
});

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
  @UseInterceptors(upload(20))
  async summarizeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('lang') lang: string = 'en',
    @Body('mode') mode: string = 'short',
  ) {
    return this.aiService.summarizeFile(validateFile(file, 20), lang || 'en', mode || 'short');
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
  @UseInterceptors(upload(20))
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
  @UseInterceptors(upload(50))
  async translatePdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('targetLanguage') targetLanguage: string = 'english',
    @Body('highFidelity') highFidelity: string = 'true',
  ) {
    return this.aiService.translatePdf(validateFile(file, 50), targetLanguage || 'english', highFidelity !== 'false');
  }
}
