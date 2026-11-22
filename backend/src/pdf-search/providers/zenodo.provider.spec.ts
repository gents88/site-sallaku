import { ZenodoProvider } from './zenodo.provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('ZenodoProvider', () => {
  let provider: ZenodoProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new ZenodoProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.resetAllMocks());

  it('maps a record with a PDF file, never marking it previewable', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        hits: {
          hits: [
            {
              id: 12345,
              metadata: { title: 'Dante &amp; <i>Beatrice</i>', creators: [{ name: 'Rossi, Mario' }], publication_date: '2019-05-01' },
              files: [
                { key: 'data.csv', links: { self: 'https://zenodo.org/api/records/12345/files/data.csv/content' } },
                { key: 'paper.PDF', links: { self: 'https://zenodo.org/api/records/12345/files/paper.PDF/content' } },
              ],
              links: { self_html: 'https://zenodo.org/records/12345' },
            },
          ],
        },
      }),
    );

    const results = await provider.search('dante', 10);

    expect(results).toEqual([
      {
        id: 'zenodo-12345',
        title: 'Dante & Beatrice',
        author: 'Rossi, Mario',
        year: '2019',
        source: 'zenodo',
        sourceLabel: 'Zenodo',
        pdfUrl: 'https://zenodo.org/api/records/12345/files/paper.PDF/content',
        coverUrl: null,
        detailsUrl: 'https://zenodo.org/records/12345',
        previewable: false,
        scanPpi: null,
      },
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('file_type=pdf');
    expect(url).toContain('access_status=open');
  });

  it('skips records without a PDF file', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ hits: { hits: [{ id: 1, metadata: { title: 'Solo dati' }, files: [{ key: 'a.zip', links: { self: 'x' } }] }] } }),
    );
    expect(await provider.search('x', 5)).toEqual([]);
  });

  it('returns [] on a non-OK response or a network error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 429));
    expect(await provider.search('x', 5)).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await provider.search('x', 5)).toEqual([]);
  });
});
