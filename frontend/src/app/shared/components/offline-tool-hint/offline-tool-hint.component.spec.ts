import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { OfflineToolHintComponent } from './offline-tool-hint.component';
import { NetworkStatusService } from '../../../core/services/network-status.service';

function render(online: boolean) {
  TestBed.configureTestingModule({
    imports: [OfflineToolHintComponent, TranslateModule.forRoot()],
    providers: [{ provide: NetworkStatusService, useValue: { online: signal(online) } }],
  });
  const fixture = TestBed.createComponent(OfflineToolHintComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OfflineToolHintComponent', () => {
  it('online non mostra nulla', () => {
    expect(render(true).querySelector('.oth')).toBeNull();
  });

  it('offline mostra l\'avviso come messaggio di stato annunciato dagli screen reader', () => {
    const hint = render(false).querySelector('.oth');
    expect(hint).not.toBeNull();
    expect(hint!.getAttribute('role')).toBe('status');
  });
});
