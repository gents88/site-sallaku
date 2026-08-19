import { Module } from '@nestjs/common';
import { PdfSearchController } from './pdf-search.controller';
import { PdfSearchService } from './pdf-search.service';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GutenbergProvider } from './providers/gutenberg.provider';

@Module({
  controllers: [PdfSearchController],
  providers: [PdfSearchService, InternetArchiveProvider, GutenbergProvider],
})
export class PdfSearchModule {}
