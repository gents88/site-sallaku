import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UploadClient } from '../http/upload-client.service';
import { UploadEvent } from '../http/upload-events';
import { environment } from '@env/environment';

export type TranslationLanguage =
  | 'english'
  | 'italian'
  | 'albanian'
  | 'spanish'
  | 'german'
  | 'french'
  | 'portuguese'
  | 'dutch'
  | 'polish'
  | 'russian'
  | 'chinese'
  | 'japanese';

interface TranslationLanguageOption {
  value: TranslationLanguage;
  label: string;
  flag: string;
}

export interface TranslatePdfResult {
  jobId: string;
  targetLanguage: string;
  pdfBase64?: string;
  translatedText: string;
  originalText: string;
  layoutPreserved: boolean;
  fallback: boolean;
  wordCount: number;
  pageCount: number;
  processingTime: number;
  isScanned: boolean;
  blocksTranslated: number;
  /** true solo su documenti eccezionalmente lunghi, oltre il tetto di sicurezza a blocchi del backend. */
  truncated: boolean;
}

export interface TranslateOptions {
  highFidelity?: boolean;
}

export const TRANSLATION_LANGUAGES: TranslationLanguageOption[] = [
  { value: 'english',    label: 'English',    flag: '🇬🇧' },
  { value: 'italian',    label: 'Italian',    flag: '🇮🇹' },
  { value: 'albanian',   label: 'Albanian',   flag: '🇦🇱' },
  { value: 'spanish',    label: 'Spanish',    flag: '🇪🇸' },
  { value: 'german',     label: 'German',     flag: '🇩🇪' },
  { value: 'french',     label: 'French',     flag: '🇫🇷' },
  { value: 'portuguese', label: 'Portuguese', flag: '🇵🇹' },
  { value: 'dutch',      label: 'Dutch',      flag: '🇳🇱' },
  { value: 'polish',     label: 'Polish',     flag: '🇵🇱' },
  { value: 'russian',    label: 'Russian',    flag: '🇷🇺' },
  { value: 'chinese',    label: 'Chinese',    flag: '🇨🇳' },
  { value: 'japanese',   label: 'Japanese',   flag: '🇯🇵' },
];

@Injectable({ providedIn: 'root' })
export class PdfTranslateService {
  private readonly api = `${environment.apiUrl}/ai`;
  private readonly upload = inject(UploadClient);

  translate(
    file: File,
    targetLanguage: TranslationLanguage,
    options: TranslateOptions = {},
  ): Observable<UploadEvent<TranslatePdfResult>> {

    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('targetLanguage', targetLanguage);
    formData.append('highFidelity', String(options.highFidelity !== false));

    return this.upload.post<TranslatePdfResult>(`${this.api}/translate-pdf`, formData);
  }

  downloadPdf(base64: string, filename: string): void {
    const byteChars = atob(base64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadText(text: string, filename: string): void {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
