import { InternetArchiveProvider } from './internet-archive.provider';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('InternetArchiveProvider', () => {
  let provider: InternetArchiveProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new InternetArchiveProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('builds a correctly encoded pdfUrl for filenames with spaces', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('advancedsearch')) {
        return Promise.resolve(
          jsonResponse({
            response: { docs: [{ identifier: 'the-little-prince', title: 'The Little Prince', creator: 'Saint-Exupéry', year: '1943' }] },
          }),
        );
      }
      if (url.includes('/metadata/')) {
        return Promise.resolve(
          jsonResponse({ files: [{ name: 'The Little Prince.pdf', format: 'Text PDF' }] }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const results = await provider.search('little prince', 10);

    expect(results).toHaveLength(1);
    expect(results[0].pdfUrl).toBe(
      'https://archive.org/download/the-little-prince/The%20Little%20Prince.pdf',
    );
    expect(results[0].previewable).toBe(true);
    expect(results[0].source).toBe('internet_archive');
  });

  it('skips Controlled Digital Lending items (access-restricted-item: true)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('advancedsearch')) {
        return Promise.resolve(
          jsonResponse({ response: { docs: [{ identifier: 'restricted-book', title: 'Restricted' }] } }),
        );
      }
      if (url.includes('/metadata/')) {
        return Promise.resolve(
          jsonResponse({
            metadata: { 'access-restricted-item': 'true' },
            files: [{ name: 'restricted-book.pdf', format: 'Text PDF' }],
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const results = await provider.search('restricted', 10);

    expect(results).toEqual([]);
  });

  it('returns an empty array when advancedsearch responds non-ok', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 503));

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });

  it('returns an empty array when fetch throws (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));

    const results = await provider.search('anything', 10);

    expect(results).toEqual([]);
  });

  it('drops a doc whose metadata lookup fails, without failing the whole search', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('advancedsearch')) {
        return Promise.resolve(
          jsonResponse({
            response: {
              docs: [
                { identifier: 'ok-book', title: 'OK Book' },
                { identifier: 'broken-book', title: 'Broken Book' },
              ],
            },
          }),
        );
      }
      if (url.includes('/metadata/ok-book')) {
        return Promise.resolve(jsonResponse({ files: [{ name: 'ok-book.pdf', format: 'Text PDF' }] }));
      }
      if (url.includes('/metadata/broken-book')) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const results = await provider.search('books', 10);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ia-ok-book');
  });
});
