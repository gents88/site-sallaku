import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

export type PptStyle = 'business' | 'education' | 'minimal' | 'modern' | 'pitch_deck';

export interface PptSlide {
  title: string;
  content: string;
  notes?: string;
}

interface GeneratePptRequest {
  topic: string;
  slideCount?: number;
  style?: PptStyle;
  context?: string;
  file?: File;
}

export interface GeneratePptResult {
  title: string;
  style: string;
  slideCount: number;
  processingTime: number;
  slides: PptSlide[];
}

interface PptStyleConfig {
  value: PptStyle;
  label: string;
  icon: string;
  desc: string;
}

export const PPT_STYLES: PptStyleConfig[] = [
  { value: 'business',   label: 'Business',   icon: '💼', desc: 'Professional corporate style' },
  { value: 'education',  label: 'Education',  icon: '🎓', desc: 'Academic & learning focus' },
  { value: 'minimal',    label: 'Minimal',    icon: '⬜', desc: 'Clean and simple layout' },
  { value: 'modern',     label: 'Modern',     icon: '🚀', desc: 'Vibrant contemporary design' },
  { value: 'pitch_deck', label: 'Pitch Deck', icon: '📈', desc: 'Startup investor-ready deck' },
];

export const SLIDE_COUNT_OPTIONS = [5, 10, 15, 20] as const;

@Injectable({ providedIn: 'root' })
export class AiPptService {
  private readonly api = `${environment.apiUrl}/ai`;
  private readonly http = inject(HttpClient);

  readonly isLoading = signal<boolean>(false);

  generate(req: GeneratePptRequest): Observable<GeneratePptResult> {
    this.isLoading.set(true);

    const formData = new FormData();
    formData.append('topic', req.topic);
    formData.append('slideCount', String(req.slideCount ?? 10));
    formData.append('style', req.style ?? 'modern');
    if (req.context) formData.append('context', req.context);
    if (req.file) formData.append('file', req.file, req.file.name);

    return this.http
      .post<GeneratePptResult>(`${this.api}/generate-ppt`, formData)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => throwError(() => err)),
      );
  }

  /** @returns whether the exported PDF had to cut off content on any slide (space ran out on the page). */
  async exportAsPdf(result: GeneratePptResult): Promise<boolean> {
    const { blob, truncated } = await this.buildPdfBlob(result);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.sanitizeFilename(result.title)}_slides.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    return truncated;
  }

  /**
   * Builds the multi-page PDF without triggering a download — used to hand the deck off to
   * another lab tool (Workspace). Also reports whether any slide's content had to be cut off
   * because it didn't fit on the page, so callers can warn the user instead of silently
   * handing them a PDF with missing text.
   */
  async buildPdfBlob(result: GeneratePptResult): Promise<{ blob: Blob; truncated: boolean }> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const titleFont  = await doc.embedFont(StandardFonts.HelveticaBold);
    const bodyFont   = await doc.embedFont(StandardFonts.Helvetica);
    const notesFont  = await doc.embedFont(StandardFonts.HelveticaOblique);

    const pageWidth    = 792;  // 11in landscape
    const pageHeight   = 612;  // 8.5in
    const margin       = 56;
    const contentWidth = pageWidth - margin * 2;

    let truncated = false;

    result.slides.forEach((slide, i) => {
      const page = doc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - margin;

      const titleSize = 26;
      for (const line of this.wrapText(slide.title, titleFont, titleSize, contentWidth)) {
        page.drawText(line, { x: margin, y: y - titleSize, size: titleSize, font: titleFont, color: rgb(0.11, 0.09, 0.2) });
        y -= titleSize * 1.3;
      }
      y -= 10;
      page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1.5, color: rgb(0.42, 0.39, 1) });
      y -= 30;

      const bodySize = 15;
      const items = this.bulletLines(slide.content);
      const itemsToRender = items.length ? items : [slide.content.trim()];
      for (let idx2 = 0; idx2 < itemsToRender.length; idx2++) {
        const item = itemsToRender[idx2];
        const lines = this.wrapText(item, bodyFont, bodySize, contentWidth - 20);
        lines.forEach((line, idx) => {
          page.drawText((idx === 0 ? '•  ' : '   ') + line, {
            x: margin, y: y - bodySize, size: bodySize, font: bodyFont, color: rgb(0.2, 0.2, 0.24),
          });
          y -= bodySize * 1.55;
        });
        y -= 6;
        if (y < 90) {
          // Spazio esaurito sulla pagina: gli item restanti di questa slide non entrano.
          if (idx2 < itemsToRender.length - 1) truncated = true;
          break;
        }
      }

      if (slide.notes) {
        let ny = 62;
        for (const line of this.wrapText(`Notes: ${slide.notes}`, notesFont, 9.5, contentWidth).slice(0, 3)) {
          page.drawText(line, { x: margin, y: ny, size: 9.5, font: notesFont, color: rgb(0.5, 0.5, 0.55) });
          ny -= 13;
        }
      }

      const footer = `${result.title} · ${i + 1}/${result.slides.length}`;
      page.drawText(footer, {
        x: pageWidth - margin - bodyFont.widthOfTextAtSize(footer, 9),
        y: 28, size: 9, font: bodyFont, color: rgb(0.6, 0.6, 0.65),
      });
    });

    const bytes = await doc.save();
    return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), truncated };
  }

  private bulletLines(content: string): string[] {
    return content.split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean);
  }

  private wrapText(text: string, font: import('pdf-lib').PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_').toLowerCase().substring(0, 50);
  }
}
