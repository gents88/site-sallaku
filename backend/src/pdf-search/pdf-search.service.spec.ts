import { PdfSearchService } from './pdf-search.service';
import { InternetArchiveProvider } from './providers/internet-archive.provider';
import { GutenbergProvider } from './providers/gutenberg.provider';
import { ArxivProvider } from './providers/arxiv.provider';
import { PmcProvider } from './providers/pmc.provider';
import { PdfSearchResult } from './interfaces/pdf-search-result.interface';

function makeResult(source: PdfSearchResult['source'], id: string): PdfSearchResult {
  return {
    id, title: `Title ${id}`, author: '', year: '', source, sourceLabel: source,
    pdfUrl: `https://example.com/${id}.pdf`, coverUrl: null, detailsUrl: `https://example.com/${id}`,
    previewable: true,
  };
}

describe('PdfSearchService', () => {
  let service: PdfSearchService;
  let internetArchive: jest.Mocked<Pick<InternetArchiveProvider, 'search'>>;
  let gutenberg: jest.Mocked<Pick<GutenbergProvider, 'search'>>;
  let arxiv: jest.Mocked<Pick<ArxivProvider, 'search'>>;
  let pmc: jest.Mocked<Pick<PmcProvider, 'search'>>;

  beforeEach(() => {
    internetArchive = { search: jest.fn().mockResolvedValue([]) };
    gutenberg = { search: jest.fn().mockResolvedValue([]) };
    arxiv = { search: jest.fn().mockResolvedValue([]) };
    pmc = { search: jest.fn().mockResolvedValue([]) };

    service = new PdfSearchService(
      internetArchive as unknown as InternetArchiveProvider,
      gutenberg as unknown as GutenbergProvider,
      arxiv as unknown as ArxivProvider,
      pmc as unknown as PmcProvider,
    );
  });

  it('aggregates results from every provider', async () => {
    internetArchive.search.mockResolvedValue([makeResult('internet_archive', 'ia-1')]);
    gutenberg.search.mockResolvedValue([makeResult('gutenberg', 'gb-1')]);
    arxiv.search.mockResolvedValue([makeResult('arxiv', 'ax-1')]);
    pmc.search.mockResolvedValue([makeResult('pmc', 'pmc-1')]);

    const results = await service.search('query');

    expect(results.map((r) => r.id).sort()).toEqual(['ax-1', 'gb-1', 'ia-1', 'pmc-1']);
  });

  it('slices the combined results down to the requested limit', async () => {
    internetArchive.search.mockResolvedValue([makeResult('internet_archive', 'a'), makeResult('internet_archive', 'b')]);
    gutenberg.search.mockResolvedValue([makeResult('gutenberg', 'c'), makeResult('gutenberg', 'd')]);

    const results = await service.search('query', 3);

    expect(results).toHaveLength(3);
  });

  it('over-fetches per provider beyond an even split of the limit, to absorb per-item attrition', async () => {
    await service.search('query', 20);

    // 4 providers, limit 20 → an even split would be 5 each; the service adds
    // headroom (+6) so restricted/failed items don't visibly shrink the total.
    const perProviderArg = internetArchive.search.mock.calls[0][1];
    expect(perProviderArg).toBeGreaterThan(5);
  });

  it('keeps returning the other providers’ results when one provider rejects', async () => {
    internetArchive.search.mockRejectedValue(new Error('Internet Archive timed out'));
    gutenberg.search.mockResolvedValue([makeResult('gutenberg', 'gb-1')]);

    const results = await service.search('query');

    expect(results).toEqual([makeResult('gutenberg', 'gb-1')]);
  });

  it('returns an empty array when every provider rejects', async () => {
    internetArchive.search.mockRejectedValue(new Error('down'));
    gutenberg.search.mockRejectedValue(new Error('down'));
    arxiv.search.mockRejectedValue(new Error('down'));
    pmc.search.mockRejectedValue(new Error('down'));

    const results = await service.search('query');

    expect(results).toEqual([]);
  });
});
