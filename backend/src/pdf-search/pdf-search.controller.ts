import { Controller, Get, Query, Param, Req, Res, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PdfSearchService } from './pdf-search.service';
import { GutenbergProvider } from './providers/gutenberg.provider';

@ApiTags('PDF Search')
@Controller('pdf-search')
export class PdfSearchController {
  constructor(
    private readonly pdfSearchService: PdfSearchService,
    private readonly gutenbergProvider: GutenbergProvider,
  ) {}

  // ── GET /pdf-search?q=... ────────────────────────────────────────────
  @Get()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Search public-domain / open-access PDFs (Internet Archive, Project Gutenberg, arXiv)' })
  async search(@Query('q') q: string | undefined, @Req() req: Request) {
    const query = (q ?? '').trim();
    if (query.length < 2) throw new BadRequestException('q must be at least 2 characters');
    if (query.length > 200) throw new BadRequestException('q must be at most 200 characters');
    const results = await this.pdfSearchService.search(query);

    // Providers that serve their own PDF (Gutenberg) return a relative pdfUrl —
    // resolve it against whatever host this request actually came in on, so it
    // works unchanged across dev/uat/prod without a hardcoded base URL.
    const base = `${req.protocol}://${req.get('host')}`;
    const resolved = results.map((r) => (r.pdfUrl.startsWith('/') ? { ...r, pdfUrl: `${base}${r.pdfUrl}` } : r));

    return { results: resolved };
  }

  // ── GET /pdf-search/gutenberg/:id ─────────────────────────────────────
  // Project Gutenberg never publishes a PDF itself — this fetches the book's
  // plain-text edition and renders it to PDF on the fly (cached in-process).
  @Get('gutenberg/:id')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Render a Project Gutenberg book to PDF from its plain-text edition' })
  async gutenbergPdf(@Param('id') id: string, @Res() res: Response) {
    if (!/^\d+$/.test(id)) throw new BadRequestException('id must be numeric');
    const pdf = await this.gutenbergProvider.fetchAsPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(pdf);
  }
}
