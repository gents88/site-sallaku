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
  /**
   * Scan resolution in pixels per inch, for sources that are physical-book
   * scans (currently only Internet Archive). Only meaningful there — arXiv,
   * PMC and Gutenberg-generated PDFs are native digital documents, never
   * scans, so this is always null for them. Also null on Internet Archive
   * itself when the item was uploaded as a ready-made PDF rather than run
   * through IA's own scanning pipeline — the field simply isn't recorded.
   */
  scanPpi: number | null;
}

export interface PdfSearchProvider {
  readonly source: PdfSource;
  search(query: string, limit: number): Promise<PdfSearchResult[]>;
}
