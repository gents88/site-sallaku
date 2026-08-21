import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { PdfSearchController } from './pdf-search.controller';
import { PdfSearchService } from './pdf-search.service';
import { GutenbergProvider } from './providers/gutenberg.provider';
import { PdfSearchResult } from './interfaces/pdf-search-result.interface';

function makeResult(overrides: Partial<PdfSearchResult> = {}): PdfSearchResult {
  return {
    id: 'r-1', title: 'Title', author: '', year: '', source: 'internet_archive', sourceLabel: 'Internet Archive',
    pdfUrl: 'https://archive.org/download/x/x.pdf', coverUrl: null, detailsUrl: 'https://archive.org/details/x',
    previewable: true, scanPpi: null,
    ...overrides,
  };
}

function mockResponse(): jest.Mocked<Pick<Response, 'setHeader' | 'removeHeader' | 'send'>> {
  return { setHeader: jest.fn(), removeHeader: jest.fn(), send: jest.fn() };
}

function jsonUpstream(body: unknown, ok = true, status = 200, contentType = 'application/pdf') {
  return {
    ok, status,
    headers: { get: (name: string) => (name === 'content-type' ? contentType : null) },
    arrayBuffer: () => Promise.resolve(body as ArrayBuffer),
  } as unknown as Response;
}

describe('PdfSearchController', () => {
  let controller: PdfSearchController;
  let service: jest.Mocked<Pick<PdfSearchService, 'search'>>;
  let gutenbergProvider: jest.Mocked<Pick<GutenbergProvider, 'fetchAsPdf'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = { search: jest.fn().mockResolvedValue([]) };
    gutenbergProvider = { fetchAsPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')) };
    config = { get: jest.fn().mockReturnValue('https://gentsallaku.it') };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    controller = new PdfSearchController(
      service as unknown as PdfSearchService,
      gutenbergProvider as unknown as GutenbergProvider,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => jest.resetAllMocks());

  describe('search', () => {
    const req = { protocol: 'https', get: () => 'api.gentsallaku.it' } as unknown as Request;

    it('rejects a query shorter than 2 characters', async () => {
      await expect(controller.search('a', req)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a query longer than 200 characters', async () => {
      await expect(controller.search('a'.repeat(201), req)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an undefined query', async () => {
      await expect(controller.search(undefined, req)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves a relative pdfUrl (Gutenberg) to an absolute URL using the request host', async () => {
      service.search.mockResolvedValue([makeResult({ source: 'gutenberg', pdfUrl: '/api/v1/pdf-search/gutenberg/42' })]);

      const { results } = await controller.search('piccolo principe', req);

      expect(results[0].pdfUrl).toBe('https://api.gentsallaku.it/api/v1/pdf-search/gutenberg/42');
    });

    it('leaves an already-absolute pdfUrl (Internet Archive) untouched', async () => {
      service.search.mockResolvedValue([makeResult({ pdfUrl: 'https://archive.org/download/x/x.pdf' })]);

      const { results } = await controller.search('piccolo principe', req);

      expect(results[0].pdfUrl).toBe('https://archive.org/download/x/x.pdf');
    });
  });

  describe('gutenbergPdf', () => {
    it('rejects a non-numeric id', async () => {
      await expect(controller.gutenbergPdf('not-a-number', mockResponse() as unknown as Response)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('serves the PDF and overrides the framing headers Helmet sets by default', async () => {
      const res = mockResponse();

      await controller.gutenbergPdf('42', res as unknown as Response);

      expect(gutenbergProvider.fetchAsPdf).toHaveBeenCalledWith('42');
      expect(res.removeHeader).toHaveBeenCalledWith('X-Frame-Options');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Security-Policy', expect.stringContaining('gentsallaku.it'));
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalledWith(Buffer.from('pdf-bytes'));
    });
  });

  describe('proxyPdf', () => {
    it('rejects a missing url', async () => {
      await expect(controller.proxyPdf(undefined, mockResponse() as unknown as Response)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-https url', async () => {
      await expect(controller.proxyPdf('http://archive.org/x.pdf', mockResponse() as unknown as Response)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a host that is not allow-listed (SSRF guard)', async () => {
      await expect(controller.proxyPdf('https://evil.example.com/x.pdf', mockResponse() as unknown as Response)).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('accepts an allow-listed subdomain', async () => {
      fetchMock.mockResolvedValue(jsonUpstream(new ArrayBuffer(8)));
      const res = mockResponse();

      await controller.proxyPdf('https://dn710203.ca.archive.org/x.pdf', res as unknown as Response);

      expect(fetchMock).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });

    it('rejects a non-PDF content-type from the upstream', async () => {
      fetchMock.mockResolvedValue(jsonUpstream(new ArrayBuffer(8), true, 200, 'text/html'));

      await expect(controller.proxyPdf('https://archive.org/x.pdf', mockResponse() as unknown as Response)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates an upstream fetch failure as NotFoundException', async () => {
      fetchMock.mockResolvedValue(jsonUpstream(new ArrayBuffer(8), false, 404));

      await expect(controller.proxyPdf('https://archive.org/x.pdf', mockResponse() as unknown as Response)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('streams the PDF bytes back for a valid allow-listed request', async () => {
      fetchMock.mockResolvedValue(jsonUpstream(new ArrayBuffer(8)));
      const res = mockResponse();

      await controller.proxyPdf('https://arxiv.org/pdf/1234', res as unknown as Response);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.send).toHaveBeenCalled();
    });
  });
});
