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

export interface GeneratePptRequest {
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

export interface PptStyleConfig {
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

  exportAsPdf(result: GeneratePptResult): void {
    const content = this.buildTextContent(result);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.sanitizeFilename(result.title)}_slides.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private buildTextContent(result: GeneratePptResult): string {
    const lines: string[] = [
      `PRESENTATION: ${result.title}`,
      `Style: ${result.style} | Slides: ${result.slideCount}`,
      '='.repeat(60),
      '',
    ];
    result.slides.forEach((slide, i) => {
      lines.push(`SLIDE ${i + 1}: ${slide.title}`);
      lines.push('-'.repeat(40));
      lines.push(slide.content);
      if (slide.notes) {
        lines.push('');
        lines.push(`[SPEAKER NOTES]: ${slide.notes}`);
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_').toLowerCase().substring(0, 50);
  }
}
