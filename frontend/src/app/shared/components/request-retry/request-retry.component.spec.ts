import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import { RequestRetryComponent } from './request-retry.component';
import { TrackedRequest } from '../../utils/tracked-request';
import { UploadEvent } from '../../../core/http/upload-events';

@Component({
  standalone: true,
  imports: [RequestRetryComponent],
  template: `<app-request-retry [request]="req" (retry)="retried = retried + 1" />`,
})
class HostComponent {
  readonly req = new TrackedRequest();
  retried = 0;
}

function setup() {
  TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return fixture;
}

const button = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector('button.rr') as HTMLButtonElement | null;

describe('RequestRetryComponent', () => {
  it('non mostra nulla finché non c\'è un errore ripetibile', () => {
    const fixture = setup();
    expect(button(fixture)).toBeNull();
  });

  it('dopo un errore di rete mostra "Riprova" e al click emette retry', () => {
    const fixture = setup();
    const events = new Subject<UploadEvent<string>>();
    fixture.componentInstance.req.run(events, { next: () => {}, error: () => {} });
    events.error({ status: 0 });
    fixture.detectChanges();

    const btn = button(fixture);
    expect(btn).not.toBeNull();
    btn!.click();
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('con un errore di validazione (422) non mostra il pulsante', () => {
    const fixture = setup();
    const events = new Subject<UploadEvent<string>>();
    fixture.componentInstance.req.run(events, { next: () => {}, error: () => {} });
    events.error({ status: 422 });
    fixture.detectChanges();
    expect(button(fixture)).toBeNull();
  });
});
