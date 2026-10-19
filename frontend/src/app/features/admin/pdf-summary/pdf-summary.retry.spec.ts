import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { PdfSummaryComponent } from './pdf-summary.component';
import { UploadClient } from '../../../core/http/upload-client.service';
import { UploadEvent } from '../../../core/http/upload-events';

function setup() {
  const calls: Subject<UploadEvent<unknown>>[] = [];
  const post = vi.fn(() => { const s = new Subject<UploadEvent<unknown>>(); calls.push(s); return s; });
  TestBed.configureTestingModule({
    imports: [PdfSummaryComponent, TranslateModule.forRoot()],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: UploadClient, useValue: { post } }],
  });
  const fixture = TestBed.createComponent(PdfSummaryComponent);
  fixture.componentInstance.selectedFile.set(new File(['x'], 'doc.pdf', { type: 'application/pdf' }));
  fixture.detectChanges();
  return { fixture, cmp: fixture.componentInstance, post, calls };
}

const retryBtn = (el: HTMLElement) => el.querySelector('app-request-retry button') as HTMLButtonElement | null;

describe('PdfSummaryComponent — Riprova dopo un errore transitorio', () => {
  it('dopo un 503 mostra "Riprova" e il click rilancia la richiesta con lo stesso file', () => {
    const { fixture, cmp, post, calls } = setup();

    cmp.summarize();
    calls[0].error({ status: 503, error: { message: 'Servizio non disponibile' } });
    fixture.detectChanges();

    expect(cmp.error()).toBe('Servizio non disponibile');
    const btn = retryBtn(fixture.nativeElement);
    expect(btn).not.toBeNull();

    btn!.click();
    expect(post).toHaveBeenCalledTimes(2);
    const firstFile = (post.mock.calls[0] as unknown as [string, FormData])[1].get('file') as File;
    const secondFile = (post.mock.calls[1] as unknown as [string, FormData])[1].get('file') as File;
    expect(secondFile.name).toBe(firstFile.name);
  });

  it('dopo un 413 (file troppo grande) non offre "Riprova"', () => {
    const { fixture, cmp, calls } = setup();

    cmp.summarize();
    calls[0].error({ status: 413, error: { message: 'File troppo grande' } });
    fixture.detectChanges();

    expect(cmp.error()).toBe('File troppo grande');
    expect(retryBtn(fixture.nativeElement)).toBeNull();
  });

  it('se dopo l\'errore l\'utente sceglie un file non ammesso, "Riprova" sparisce', () => {
    const { fixture, cmp, calls } = setup();

    cmp.summarize();
    calls[0].error({ status: 0 });
    fixture.detectChanges();
    expect(retryBtn(fixture.nativeElement)).not.toBeNull();

    cmp.onFilesDropped({ 0: new File(['x'], 'malware.exe'), length: 1, item: () => null } as unknown as FileList);
    fixture.detectChanges();
    expect(cmp.error()).toBeTruthy();
    expect(retryBtn(fixture.nativeElement)).toBeNull();
  });
});
