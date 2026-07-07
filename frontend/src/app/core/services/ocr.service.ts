import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export const OCR_LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'ita', label: 'Italiano' },
  { code: 'spa', label: 'Español' },
  { code: 'fra', label: 'Français' },
  { code: 'deu', label: 'Deutsch' },
  { code: 'por', label: 'Português' },
  { code: 'sqi', label: 'Shqip' },
] as const;

export interface OcrPageResult {
  index: number;
  text: string;
  confidence: number;
}

export interface OcrResult {
  lang: string;
  pages: OcrPageResult[];
  text: string;
}

@Injectable({ providedIn: 'root' })
export class OcrService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/ocr`;

  extract(images: { blob: Blob; name: string }[], lang: string): Observable<OcrResult> {
    const form = new FormData();
    form.append('lang', lang);
    images.forEach((img) => form.append('files', img.blob, img.name));
    return this.http.post<OcrResult>(`${this.api}/extract`, form);
  }
}
