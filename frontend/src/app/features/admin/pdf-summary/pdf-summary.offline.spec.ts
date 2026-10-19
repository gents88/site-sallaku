import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { PdfSummaryComponent } from './pdf-summary.component';
import { NetworkStatusService } from '../../../core/services/network-status.service';

function render(online: boolean) {
  const onlineSignal = signal(online);
  TestBed.configureTestingModule({
    imports: [PdfSummaryComponent, TranslateModule.forRoot()],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: NetworkStatusService, useValue: { online: onlineSignal } }],
  });
  const fixture = TestBed.createComponent(PdfSummaryComponent);
  fixture.componentInstance.selectedFile.set(new File(['x'], 'doc.pdf'));
  fixture.detectChanges();
  return { fixture, onlineSignal, el: fixture.nativeElement as HTMLElement };
}

describe('PdfSummaryComponent — senza connessione', () => {
  it('online il pulsante è attivo e l\'avviso assente', () => {
    const { el } = render(true);
    expect((el.querySelector('.summarize-btn') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelector('app-offline-tool-hint .oth')).toBeNull();
  });

  it('offline disabilita l\'invio e spiega perché; tornati online si riabilita', () => {
    const { fixture, onlineSignal, el } = render(false);
    expect((el.querySelector('.summarize-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('app-offline-tool-hint .oth')).not.toBeNull();

    onlineSignal.set(true);
    fixture.detectChanges();
    expect((el.querySelector('.summarize-btn') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelector('app-offline-tool-hint .oth')).toBeNull();
  });
});
