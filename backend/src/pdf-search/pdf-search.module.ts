import { Module } from '@nestjs/common';
import { ConversionModule } from '../conversion/conversion.module';
import { PdfSearchController } from './pdf-search.controller';
import { PdfSearchService } from './pdf-search.service';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GutenbergProvider } from './providers/gutenberg.provider';
import { ArxivProvider } from './providers/arxiv.provider';
import { PmcProvider } from './providers/pmc.provider';

@Module({
  imports: [ConversionModule],
  controllers: [PdfSearchController],
  providers: [PdfSearchService, InternetArchiveProvider, GutenbergProvider, ArxivProvider, PmcProvider],
})
export class PdfSearchModule {}
