import { WikimediaProvider } from './wikimedia.provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

const page = (over: Record<string, unknown> = {}) => ({
  pageid: 1,
  index: 1,
  title: 'File:La_Divina_Commedia_(1555).pdf',
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/La_Divina_Commedia_%281555%29.pdf',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:La_Divina_Commedia_(1555).pdf',
      mime: 'application/pdf',
      size: 5_000_000,
      extmetadata: { Artist: { value: '<a href="x">Dante Alighieri</a>' }, DateTimeOriginal: { value: '1555' } },
    },
  ],
  ...over,
});

describe('WikimediaProvider', () => {
  let provider: WikimediaProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new WikimediaProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.resetAllMocks());

  it('maps a Commons PDF, cleaning title and author and ordering by relevance index', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        query: {
          pages: {
            '2': page({ pageid: 2, index: 2, title: 'File:Altro.pdf' }),
            '1': page(),
          },
        },
      }),
    );

    const results = await provider.search('dante', 10);

    expect(results.map((r) => r.id)).toEqual(['wikimedia-1', 'wikimedia-2']);
    expect(results[0]).toMatchObject({
      title: 'La Divina Commedia (1555)',
      author: 'Dante Alighieri',
      year: '1555',
      source: 'wikimedia',
      sourceLabel: 'Wikimedia Commons',
      previewable: false,
      pdfUrl: expect.stringContaining('upload.wikimedia.org'),
    });
  });

  it('sends a descriptive User-Agent, as Wikimedia policy requires', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ query: { pages: {} } }));
    await provider.search('x', 5);
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['User-Agent']).toMatch(/SiteSallaku/);
  });

  it('drops non-PDF files and files too large for the proxy', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        query: {
          pages: {
            '1': page({ pageid: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/a.djvu', mime: 'image/vnd.djvu', size: 10 }] }),
            '2': page({ pageid: 2, imageinfo: [{ url: 'https://upload.wikimedia.org/b.pdf', mime: 'application/pdf', size: 500 * 1024 * 1024 }] }),
          },
        },
      }),
    );
    expect(await provider.search('x', 5)).toEqual([]);
  });

  it('returns [] when the API fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
    expect(await provider.search('x', 5)).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect(await provider.search('x', 5)).toEqual([]);
  });
});
