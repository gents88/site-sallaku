import { Module } from '@nestjs/common';
import { PdfSearchController } from './pdf-search.controller';
import { PdfSearchService } from './pdf-search.service';
import { InternetArchiveProvider } from './providers/internet-archive.provider';

@Module({
  controllers: [PdfSearchController],
  providers: [PdfSearchService, InternetArchiveProvider],
})
export class PdfSearchModule {}
