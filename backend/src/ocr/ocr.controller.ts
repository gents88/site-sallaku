import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';

import { OcrService, OcrResult } from './ocr.service';

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_FILE_COUNT = 30;

const IMAGE_MIME_WHITELIST = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/octet-stream',
];

@ApiTags('ocr')
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocr: OcrService) {}

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Extract text from one or more images via OCR' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILE_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (IMAGE_MIME_WHITELIST.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type not allowed: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async extract(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body('lang') lang: string = 'eng',
  ): Promise<OcrResult> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No image files uploaded');
    }
    return this.ocr.recognize(files.map((f) => f.buffer), lang || 'eng');
  }
}
