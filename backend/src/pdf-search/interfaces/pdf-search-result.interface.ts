export type PdfSource = 'internet_archive' | 'gutenberg' | 'arxiv' | 'pmc';

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
  /** False when the source's own server refuses iframe embedding outright (e.g. PMC sends X-Frame-Options: DENY) — the frontend must skip the preview iframe and go straight to a download link. */
  previewable: boolean;
}

export interface PdfSearchProvider {
  readonly source: PdfSource;
  search(query: string, limit: number): Promise<PdfSearchResult[]>;
}
