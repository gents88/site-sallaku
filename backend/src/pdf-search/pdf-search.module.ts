import { Module } from '@nestjs/common';
import { ConversionModule } from '../conversion/conversion.module';
import { PdfSearchController } from './pdf-search.controller';
import { PdfSearchService } from './pdf-search.service';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GutenbergProvider } from './providers/gutenberg.provider';

@Module({
  imports: [ConversionModule],
  controllers: [PdfSearchController],
  providers: [PdfSearchService, InternetArchiveProvider, GutenbergProvider],
})
export class PdfSearchModule {}
