import { Controller, Get, Query, Param, Req, Res, BadRequestException, NotFoundException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PdfSearchService } from './pdf-search.service';
import { GutenbergProvider } from './providers/gutenberg.provider';

// Hosts the /proxy endpoint will fetch on the client's behalf — an allow-list,
// not a generic proxy, to keep this from becoming an SSRF vector.
const PROXY_ALLOWED_HOSTS = ['archive.org', 'arxiv.org', 'europepmc.org'];
const PROXY_MAX_BYTES = 100 * 1024 * 1024;

@ApiTags('PDF Search')
@Controller('pdf-search')
export class PdfSearchController {
  constructor(
    private readonly pdfSearchService: PdfSearchService,
    private readonly gutenbergProvider: GutenbergProvider,
    private readonly config: ConfigService,
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

    // Helmet's global defaults (X-Frame-Options: SAMEORIGIN, CSP frame-ancestors
    // 'self') protect the API's normal JSON endpoints from clickjacking, but
    // they also block the frontend — a different origin — from embedding this
    // one legitimately-public PDF in its preview <iframe>. Override just here,
    // scoped to the same origins CORS already trusts, rather than loosening
    // framing globally.
    const frontendOrigins = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frontendOrigins.join(' ')}`);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(pdf);
  }

  // ── GET /pdf-search/proxy?url=... ────────────────────────────────────
  // Internet Archive doesn't send Access-Control-Allow-Origin on its PDF
  // files (verified live), so the frontend can't fetch() the bytes directly
  // to hand them to the Workspace tool — only <iframe>/<a> navigation works
  // cross-origin without it. This relays the bytes through our own origin,
  // which the frontend already has CORS access to.
  @Get('proxy')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Proxy-fetch a PDF from an allow-listed source for cross-origin client-side use' })
  async proxyPdf(@Query('url') url: string | undefined, @Res() res: Response) {
    if (!url) throw new BadRequestException('url is required');

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('url is not a valid URL');
    }
    if (parsed.protocol !== 'https:') throw new BadRequestException('url must use https');
    const allowed = PROXY_ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    if (!allowed) throw new BadRequestException('url host is not allow-listed');

    const upstream = await fetch(parsed.toString(), { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok) throw new NotFoundException('Could not fetch the requested file');

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf')) throw new BadRequestException('Requested resource is not a PDF');

    const contentLength = Number(upstream.headers.get('content-length') ?? '0');
    if (contentLength > PROXY_MAX_BYTES) throw new BadRequestException('File is too large to proxy');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.byteLength > PROXY_MAX_BYTES) throw new BadRequestException('File is too large to proxy');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }
}
