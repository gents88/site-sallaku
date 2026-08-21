import { ArxivProvider } from './arxiv.provider';

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(body) } as Response;
}

const ATOM_HEADER = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
  <opensearch:totalResults>1</opensearch:totalResults>`;

const ATOM_FOOTER = `</feed>`;

function entry({
  id = 'quant-ph/9708022v2',
  title = 'Quantum Computing',
  author = 'Andrew Steane',
  published = '1997-08-12T13:21:47Z',
  withPdfLink = true,
}: Partial<{ id: string; title: string; author: string; published: string; withPdfLink: boolean }> = {}) {
  const pdfLink = withPdfLink
    ? `<link href="https://arxiv.org/pdf/${id}" rel="related" type="application/pdf" title="pdf"/>`
    : '';
  return `
  <entry>
    <id>http://arxiv.org/abs/${id}</id>
    <title>${title}</title>
    <link href="https://arxiv.org/abs/${id}" rel="alternate" type="text/html"/>
    ${pdfLink}
    <summary>A summary.</summary>
    <published>${published}</published>
    <author><name>${author}</name></author>
  </entry>`;
}

describe('ArxivProvider', () => {
  let provider: ArxivProvider;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    provider = new ArxivProvider();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('extracts id, title, pdfUrl, author and year from a real-shaped Atom feed', async () => {
    fetchMock.mockResolvedValue(textResponse(ATOM_HEADER + entry() + ATOM_FOOTER));

    const results = await provider.search('quantum computing', 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: 'arxiv-quant-ph/9708022v2',
      title: 'Quantum Computing',
      author: 'Andrew Steane',
      year: '1997',
      source: 'arxiv',
      sourceLabel: 'arXiv',
      pdfUrl: 'https://arxiv.org/pdf/quant-ph/9708022v2',
      detailsUrl: 'https://arxiv.org/abs/quant-ph/9708022v2',
      coverUrl: null,
      previewable: true,
    });
  });

  it('decodes XML entities and collapses whitespace in the title', async () => {
    const xmlTitle = 'Estimating the &lt;sup&gt;23&lt;/sup&gt;Na-MRI\n    Content &amp; More';
    fetchMock.mockResolvedValue(textResponse(ATOM_HEADER + entry({ title: xmlTitle }) + ATOM_FOOTER));

    const results = await provider.search('mri', 5);

    expect(results[0].title).toBe('Estimating the <sup>23</sup>Na-MRI Content & More');
  });

  it('skips entries with no PDF link', async () => {
    fetchMock.mockResolvedValue(textResponse(ATOM_HEADER + entry({ withPdfLink: false }) + ATOM_FOOTER));

    const results = await provider.search('quantum computing', 5);

    expect(results).toEqual([]);
  });

  it('returns an empty array when arXiv responds non-ok', async () => {
    fetchMock.mockResolvedValue(textResponse('', false, 503));

    const results = await provider.search('anything', 5);

    expect(results).toEqual([]);
  });

  it('returns an empty array when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'));

    const results = await provider.search('anything', 5);

    expect(results).toEqual([]);
  });

  it('parses multiple entries from the same feed', async () => {
    const xml = ATOM_HEADER + entry({ id: 'a1' }) + entry({ id: 'a2', title: 'Second Paper' }) + ATOM_FOOTER;
    fetchMock.mockResolvedValue(textResponse(xml));

    const results = await provider.search('two papers', 5);

    expect(results.map((r) => r.id)).toEqual(['arxiv-a1', 'arxiv-a2']);
  });

  it('sends a quoted phrase, not a bare multi-word value — arXiv silently splits an unquoted value into an OR of the individual terms (verified live), surfacing papers whose author happens to be surnamed after one of the words rather than papers about the phrase', async () => {
    fetchMock.mockResolvedValue(textResponse(ATOM_HEADER + ATOM_FOOTER));

    await provider.search('piccolo principe', 5);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('search_query')).toBe('all:"piccolo principe"');
  });

  it('strips double quotes from the query so a user-supplied quote cannot break out of the phrase wrapper', async () => {
    fetchMock.mockResolvedValue(textResponse(ATOM_HEADER + ATOM_FOOTER));

    await provider.search('foo "bar" baz', 5);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('search_query')).toBe(`all:"foo 'bar' baz"`);
  });
});
