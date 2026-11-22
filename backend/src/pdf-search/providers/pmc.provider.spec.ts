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
    // La verifica del PDF ha test propri (in fondo): negli altri il PDF risulta disponibile.
    jest.spyOn(provider as unknown as { pdfAvailable: () => Promise<boolean> }, 'pdfAvailable').mockResolvedValue(true);
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

  it('scopes the query to TITLE:(...) instead of an unqualified value — Europe PMC\'s default field matches title/abstract/author/full-text together, so an unqualified multi-word query loosely matched any single field (e.g. an author surname), unrelated to the query as a whole (verified live)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ resultList: { result: [] } }));

    await provider.search('piccolo principe', 10);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('query')).toBe('TITLE:(piccolo principe) AND OPEN_ACCESS:Y AND HAS_PDF:Y');
  });
  describe('verifica che il PDF esista davvero', () => {
    const search = {
      resultList: { result: [
        { pmcid: 'PMC1', title: 'Buono', hasPDF: 'Y' },
        { pmcid: 'PMC2', title: 'Senza PDF', hasPDF: 'Y' },
      ] },
    };
    const pdfRes = (ok: boolean, type: string) => ({ ok, headers: { get: () => type }, body: { cancel: () => Promise.resolve() } }) as unknown as Response;

    beforeEach(() => {
      (provider as unknown as { pdfAvailable: jest.SpyInstance }).pdfAvailable.mockRestore();
    });

    it('scarta i risultati il cui PDF non si scarica (risposta non PDF o non OK) e tiene gli altri', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('webservices/rest/search')) return Promise.resolve(jsonResponse(search));
        return Promise.resolve(url.includes('PMC1') ? pdfRes(true, 'application/pdf') : pdfRes(true, 'application/json'));
      });

      const results = await provider.search('x', 10);

      expect(results.map((r) => r.id)).toEqual(['pmc-PMC1']);
    });

    it('scarta anche una risposta non OK', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(url.includes('webservices/rest/search') ? jsonResponse(search) : pdfRes(false, 'application/pdf')));

      expect(await provider.search('x', 10)).toEqual([]);
    });

    it('un timeout o un errore di rete non scartano il risultato', async () => {
      fetchMock.mockImplementation((url: string) =>
        url.includes('webservices/rest/search') ? Promise.resolve(jsonResponse(search)) : Promise.reject(new Error('timeout')));

      expect((await provider.search('x', 10)).map((r) => r.id)).toEqual(['pmc-PMC1', 'pmc-PMC2']);
    });

    it('ricorda l\'esito: la stessa ricerca ripetuta non ricontrolla i PDF', async () => {
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(url.includes('webservices/rest/search') ? jsonResponse(search) : pdfRes(true, 'application/pdf')));

      await provider.search('x', 10);
      const calls = fetchMock.mock.calls.length;
      await provider.search('x', 10);

      expect(fetchMock.mock.calls.length).toBe(calls + 1); // solo la ricerca, non i 2 PDF
    });
  });
});
