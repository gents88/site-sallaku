import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  Res,
  BadRequestException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { memoryStorage } from 'multer';

import { ConversionService } from './conversion.service';
import { ConvertDto, SUPPORTED_CONVERSIONS } from './dto/convert.dto';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 20;

const SAFE_MIME_WHITELIST = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/html',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

@ApiTags('conversion')
@Controller('convert')
export class ConversionController {
  private readonly logger = new Logger(ConversionController.name);

  constructor(private readonly conversion: ConversionService) {}

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        conversionType: { type: 'string', enum: [...SUPPORTED_CONVERSIONS] },
        inputType: { type: 'string', enum: ['file', 'base64', 'json'] },
        data: { type: 'string' },
        options: { type: 'object' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
      required: ['conversionType', 'inputType'],
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILE_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (
          SAFE_MIME_WHITELIST.includes(file.mimetype) ||
          file.mimetype === 'application/octet-stream'
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type not allowed: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async convert(
    @Body() body: ConvertDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { conversionType, inputType, data: rawData, options } = body;

    if (!conversionType) throw new BadRequestException('conversionType is required');
    if (!inputType) throw new BadRequestException('inputType is required');

    const fileBuffers = (files ?? []).map((f) => f.buffer);
    const fileMimes = (files ?? []).map((f) => f.mimetype);

    const result = await this.conversion.convert(
      conversionType,
      inputType,
      fileBuffers,
      fileMimes,
      rawData,
      options,
    );

    if (result.isStructured) {
      res.status(HttpStatus.OK).json(result.json);
      return;
    }

    const buf = result.buffer!;
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Content-Length': String(buf.length),
      'X-Conversion-Type': conversionType,
    });
    res.status(HttpStatus.OK).end(buf);
  }
}
