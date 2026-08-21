import { NotFoundException } from '@nestjs/common';
import { GutenbergProvider } from './gutenberg.provider';
import { DataConverter } from '../../conversion/converters/data.converter';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

function textResponse(body: string, ok = true, status = 200) {
  return { ok, status, text: () => Promise.resolve(body) } as Response;
}

describe('GutenbergProvider', () => {
  let provider: GutenbergProvider;
  let dataConverter: jest.Mocked<Pick<DataConverter, 'textToPdf'>>;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    dataConverter = { textToPdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-bytes')) };
    provider = new GutenbergProvider(dataConverter as unknown as DataConverter);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('search', () => {
    it('excludes books with no text/plain format (Gutenberg never publishes a PDF directly)', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          results: [
            { id: 1, title: 'No Text Edition', authors: [{ name: 'Someone' }], formats: { 'application/epub+zip': 'x.epub' } },
            { id: 2, title: 'Has Text', authors: [{ name: 'Someone Else' }], formats: { 'text/plain; charset=utf-8': 'x.txt' } },
          ],
        }),
      );

      const results = await provider.search('query', 10);

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('gb-2');
      expect(results[0].pdfUrl).toBe('/api/v1/pdf-search/gutenberg/2');
      expect(results[0].previewable).toBe(true);
    });

    it('returns an empty array when gutendex responds non-ok', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false, 500));

      const results = await provider.search('query', 10);

      expect(results).toEqual([]);
    });
  });

  describe('sanitizeForPdf (private — pdf-lib crashes on these characters)', () => {
    it('normalizes CRLF, converts form-feed to a paragraph break, and strips control chars', () => {
      const dirty = 'Line one\r\nLine two\x0CPage two\r\nBell:\x07end';
      const clean = (provider as any).sanitizeForPdf(dirty);

      expect(clean).not.toMatch(/\r/);
      expect(clean).not.toMatch(/\x0C/);
      expect(clean).not.toMatch(/\x07/);
      expect(clean).toBe('Line one\nLine two\n\nPage two\nBell:end');
    });
  });

  describe('stripBoilerplate (private)', () => {
    it('extracts only the text between the Gutenberg START/END markers', () => {
      const raw = [
        'Some legal preamble.',
        '*** START OF THE PROJECT GUTENBERG EBOOK EXAMPLE ***',
        'Actual book content here.',
        '*** END OF THE PROJECT GUTENBERG EBOOK EXAMPLE ***',
        'Trailing license text.',
      ].join('\n');

      const result = (provider as any).stripBoilerplate(raw);

      expect(result).toBe('Actual book content here.');
    });

    it('returns the original text unchanged when no markers are present', () => {
      const raw = 'Just plain book text, no markers.';
      expect((provider as any).stripBoilerplate(raw)).toBe(raw);
    });
  });

  describe('fetchAsPdf', () => {
    const bookResponse = () =>
      jsonResponse({ id: 42, title: 'Test Book', authors: [{ name: 'Author' }], formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/ebooks/42.txt.utf-8' } });

    it('caches the converted PDF — a second call for the same id does not re-fetch', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('gutendex.com/books/42')) return Promise.resolve(bookResponse());
        if (url.includes('42.txt.utf-8')) return Promise.resolve(textResponse('*** START OF THE PROJECT GUTENBERG EBOOK X ***\nBody\n*** END OF THE PROJECT GUTENBERG EBOOK X ***'));
        throw new Error(`unexpected fetch: ${url}`);
      });

      const first = await provider.fetchAsPdf('42');
      const callsAfterFirst = fetchMock.mock.calls.length;
      const second = await provider.fetchAsPdf('42');

      expect(second).toBe(first);
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
      expect(dataConverter.textToPdf).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the book has no plain-text edition', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ id: 99, title: 'No Text', authors: [], formats: { 'application/epub+zip': 'x.epub' } }),
      );

      await expect(provider.fetchAsPdf('99')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('wraps a textToPdf failure (unencodable character) in a clean NotFoundException', async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('gutendex.com/books/7')) {
          return Promise.resolve(
            jsonResponse({ id: 7, title: 'Weird Chars', authors: [], formats: { 'text/plain; charset=utf-8': 'https://www.gutenberg.org/ebooks/7.txt.utf-8' } }),
          );
        }
        return Promise.resolve(textResponse('some text'));
      });
      dataConverter.textToPdf.mockRejectedValueOnce(new Error('WinAnsi cannot encode "☃"'));

      await expect(provider.fetchAsPdf('7')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
