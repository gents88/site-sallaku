import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export type InputType = 'file' | 'base64' | 'json';

export const CONVERSION_TYPES = [
  // Documenti
  { id: 'pdf-to-docx',   group: 'Documenti',    from: 'PDF',  to: 'DOCX',  label: 'convert.type_pdf_to_docx',   accept: '.pdf',                    multi: false },
  { id: 'docx-to-pdf',   group: 'Documenti',    from: 'DOCX', to: 'PDF',   label: 'convert.type_docx_to_pdf',   accept: '.doc,.docx',              multi: false },
  { id: 'pdf-to-txt',    group: 'Documenti',    from: 'PDF',  to: 'TXT',   label: 'convert.type_pdf_to_txt',    accept: '.pdf',                    multi: false },
  { id: 'pdf-to-html',   group: 'Documenti',    from: 'PDF',  to: 'HTML',  label: 'convert.type_pdf_to_html',   accept: '.pdf',                    multi: false },
  { id: 'html-to-pdf',   group: 'Documenti',    from: 'HTML', to: 'PDF',   label: 'convert.type_html_to_pdf',   accept: '.html,.htm',              multi: false },
  { id: 'html-to-docx',  group: 'Documenti',    from: 'HTML', to: 'DOCX',  label: 'convert.type_html_to_docx',  accept: '.html,.htm',              multi: false },
  { id: 'docx-to-txt',   group: 'Documenti',    from: 'DOCX', to: 'TXT',   label: 'convert.type_docx_to_txt',   accept: '.doc,.docx',              multi: false },
  { id: 'docx-to-html',  group: 'Documenti',    from: 'DOCX', to: 'HTML',  label: 'convert.type_docx_to_html',  accept: '.doc,.docx',              multi: false },
  { id: 'txt-to-pdf',    group: 'Documenti',    from: 'TXT',  to: 'PDF',   label: 'convert.type_txt_to_pdf',    accept: '.txt',                    multi: false },
  { id: 'txt-to-docx',   group: 'Documenti',    from: 'TXT',  to: 'DOCX',  label: 'convert.type_txt_to_docx',   accept: '.txt',                    multi: false },
  { id: 'md-to-html',    group: 'Documenti',    from: 'MD',   to: 'HTML',  label: 'convert.type_md_to_html',    accept: '.md,.txt',                multi: false },
  { id: 'md-to-pdf',     group: 'Documenti',    from: 'MD',   to: 'PDF',   label: 'convert.type_md_to_pdf',     accept: '.md,.txt',                multi: false },
  // Spreadsheet
  { id: 'csv-to-excel',  group: 'Spreadsheet',  from: 'CSV',  to: 'XLSX',  label: 'convert.type_csv_to_excel',  accept: '.csv,.txt',               multi: false },
  { id: 'excel-to-csv',  group: 'Spreadsheet',  from: 'XLSX', to: 'CSV',   label: 'convert.type_excel_to_csv',  accept: '.xlsx,.xls',              multi: false },
  { id: 'excel-to-json', group: 'Spreadsheet',  from: 'XLSX', to: 'JSON',  label: 'convert.type_excel_to_json', accept: '.xlsx,.xls',              multi: false },
  { id: 'excel-to-html', group: 'Spreadsheet',  from: 'XLSX', to: 'HTML',  label: 'convert.type_excel_to_html', accept: '.xlsx,.xls',              multi: false },
  { id: 'excel-to-pdf',  group: 'Spreadsheet',  from: 'XLSX', to: 'PDF',   label: 'convert.type_excel_to_pdf',  accept: '.xlsx,.xls',              multi: false },
  { id: 'csv-to-pdf',    group: 'Spreadsheet',  from: 'CSV',  to: 'PDF',   label: 'convert.type_csv_to_pdf',    accept: '.csv,.txt',               multi: false },
  { id: 'csv-to-json',   group: 'Spreadsheet',  from: 'CSV',  to: 'JSON',  label: 'convert.type_csv_to_json',   accept: '.csv,.txt',               multi: false },
  { id: 'json-to-csv',   group: 'Spreadsheet',  from: 'JSON', to: 'CSV',   label: 'convert.type_json_to_csv',   accept: '.json',                   multi: false },
  // Immagini
  { id: 'jpg-to-png',    group: 'Immagini',     from: 'JPG',  to: 'PNG',   label: 'convert.type_jpg_to_png',    accept: '.jpg,.jpeg',              multi: false },
  { id: 'png-to-jpg',    group: 'Immagini',     from: 'PNG',  to: 'JPG',   label: 'convert.type_png_to_jpg',    accept: '.png',                    multi: false },
  { id: 'png-to-webp',   group: 'Immagini',     from: 'PNG',  to: 'WEBP',  label: 'convert.type_png_to_webp',   accept: '.png,.jpg,.jpeg',         multi: false },
  { id: 'webp-to-png',   group: 'Immagini',     from: 'WEBP', to: 'PNG',   label: 'convert.type_webp_to_png',   accept: '.webp',                   multi: false },
  { id: 'image-to-pdf',  group: 'Immagini',     from: 'IMG',  to: 'PDF',   label: 'convert.type_image_to_pdf',  accept: '.png,.jpg,.jpeg,.webp',   multi: true  },
  { id: 'pdf-to-images', group: 'Immagini',     from: 'PDF',  to: 'ZIP',   label: 'convert.type_pdf_to_images', accept: '.pdf',                    multi: false },
  // Strutturati
  { id: 'pdf-to-json',   group: 'Strutturati',  from: 'PDF',  to: 'JSON',  label: 'convert.type_pdf_to_json',   accept: '.pdf',                    multi: false },
  { id: 'json-to-pdf',   group: 'Strutturati',  from: 'JSON', to: 'PDF',   label: 'convert.type_json_to_pdf',   accept: '.json',                   multi: false },
  { id: 'pdf-to-csv',    group: 'Strutturati',  from: 'PDF',  to: 'CSV',   label: 'convert.type_pdf_to_csv',    accept: '.pdf',                    multi: false },
  // Base64
  { id: 'base64-to-png', group: 'Base64',       from: 'B64',  to: 'PNG',   label: 'convert.type_b64_to_png',    accept: '',                        multi: false },
  { id: 'base64-to-jpg', group: 'Base64',       from: 'B64',  to: 'JPG',   label: 'convert.type_b64_to_jpg',    accept: '',                        multi: false },
  { id: 'base64-to-pdf', group: 'Base64',       from: 'B64',  to: 'PDF',   label: 'convert.type_b64_to_pdf',    accept: '',                        multi: false },
  { id: 'file-to-base64',group: 'Base64',       from: 'File', to: 'B64',   label: 'convert.type_file_to_b64',   accept: '*',                       multi: false },
  // Utilità
  { id: 'merge-pdf',     group: 'Utilità',      from: 'PDF+', to: 'PDF',   label: 'convert.type_merge_pdf',     accept: '.pdf',                    multi: true  },
] as const;

export type ConversionTypeId = (typeof CONVERSION_TYPES)[number]['id'];

export interface ConversionDef {
  id: ConversionTypeId;
  group: string;
  from: string;
  to: string;
  label: string;
  accept: string;
  multi: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConversionService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/convert`;

  readonly conversions: ConversionDef[] = CONVERSION_TYPES as unknown as ConversionDef[];

  convertFiles(
    conversionType: ConversionTypeId,
    files: File[],
    options?: Record<string, unknown>,
  ): Observable<HttpEvent<Blob | object>> {
    const form = new FormData();
    form.append('inputType', 'file');
    form.append('conversionType', conversionType);
    if (options) form.append('options', JSON.stringify(options));
    files.forEach((f) => form.append('files', f, f.name));

    return this.http.request(
      new HttpRequest('POST', this.api, form, {
        responseType: 'blob',
        reportProgress: true,
      }),
    );
  }

  convertBase64(
    conversionType: ConversionTypeId,
    base64: string,
    options?: Record<string, unknown>,
  ): Observable<Blob> {
    return this.http.post(
      this.api,
      { inputType: 'base64', conversionType, data: base64, options },
      { responseType: 'blob' },
    );
  }

  getGroups(): string[] {
    return [...new Set(this.conversions.map((c) => c.group))];
  }

  getByGroup(group: string): ConversionDef[] {
    return this.conversions.filter((c) => c.group === group);
  }

  getById(id: string): ConversionDef | undefined {
    return this.conversions.find((c) => c.id === id);
  }
}
