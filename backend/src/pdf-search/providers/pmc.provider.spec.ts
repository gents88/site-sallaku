import { PmcProvider } from './pmc.provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('PmcProvider', () => {
  let provider: PmcProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new PmcProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('maps a valid open-access result and always marks it previewable: false (X-Frame-Options: DENY)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        resultList: {
          result: [
            {
              pmid: '41891155',
              pmcid: 'PMC13148423',
              title: 'Oxeiptosis - potential in cancer treatment?',
              authorString: 'Kciuk M, Wanke K, Kontek R.',
              pubYear: '2026',
              hasPDF: 'Y',
            },
          ],
        },
      }),
    );

    const results = await provider.search('cancer', 10);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'pmc-PMC13148423',
      title: 'Oxeiptosis - potential in cancer treatment?',
      author: 'Kciuk M',
      year: '2026',
      source: 'pmc',
      sourceLabel: 'PubMed Central',
      pdfUrl: 'https://europepmc.org/articles/PMC13148423?pdf=render',
      coverUrl: null,
      previewable: false,
    });
  });

  it('strips HTML entities and markup from the title', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        resultList: {
          result: [
            {
              pmcid: 'PMC1',
              title: 'Sodium Content Using &lt;sup&gt;23&lt;/sup&gt;Na-MRI &amp; More',
              authorString: 'Author A',
              hasPDF: 'Y',
            },
          ],
        },
      }),
    );

    const results = await provider.search('mri', 10);

    expect(results[0].title).toBe('Sodium Content Using 23Na-MRI & More');
  });

  it('excludes results without hasPDF: Y', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ resultList: { result: [{ pmcid: 'PMC2', title: 'No PDF', hasPDF: 'N' }] } }),
    );

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });

  it('excludes results without a pmcid', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ resultList: { result: [{ pmid: '123', title: 'No PMC ID', hasPDF: 'Y' }] } }),
    );

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });

  it('returns an empty array when Europe PMC responds non-ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });

  it('returns an empty array when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });
});
