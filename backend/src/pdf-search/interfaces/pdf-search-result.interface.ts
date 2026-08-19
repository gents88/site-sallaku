export type PdfSource = 'internet_archive' | 'gutenberg';

export interface PdfSearchResult {
  id: string;
  title: string;
  author: string;
  year: string;
  source: PdfSource;
  sourceLabel: string;
  pdfUrl: string;
  coverUrl: string | null;
  detailsUrl: string;
}

export interface PdfSearchProvider {
  readonly source: PdfSource;
  search(query: string, limit: number): Promise<PdfSearchResult[]>;
}
