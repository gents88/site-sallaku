import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PdfSearchService } from './pdf-search.service';

@ApiTags('PDF Search')
@Controller('pdf-search')
export class PdfSearchController {
  constructor(private readonly pdfSearchService: PdfSearchService) {}

  // ── GET /pdf-search?q=... ────────────────────────────────────────────
  @Get()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search public-domain / open-access PDFs on Internet Archive' })
  async search(@Query('q') q?: string) {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('q must be at least 2 characters');
    if (query.length > 200) throw new BadRequestException('q must be at most 200 characters');
    const results = await this.pdfSearchService.search(query);
    return { results };
  }
}
