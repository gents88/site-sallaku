import { Module } from '@nestjs/common';
import { ConversionController } from './conversion.controller';
import { ConversionService } from './conversion.service';
import { PdfConverter } from './converters/pdf.converter';
import { ImageConverter } from './converters/image.converter';
import { Base64Converter } from './converters/base64.converter';
import { DataConverter } from './converters/data.converter';

@Module({
  controllers: [ConversionController],
  providers: [
    ConversionService,
    PdfConverter,
    ImageConverter,
    Base64Converter,
    DataConverter,
  ],
  exports: [ConversionService],
})
export class ConversionModule {}
