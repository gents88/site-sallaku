import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiveChatExitConfirmComponent } from './live-chat-exit-confirm.component';

describe('LiveChatExitConfirmComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [importProvidersFrom(TranslateModule.forRoot())],
    });
  });

  function create() {
    return TestBed.createComponent(LiveChatExitConfirmComponent);
  }

  it('non mostra nulla quando step è "none"', () => {
    const fixture = create();
    fixture.componentInstance.step = 'none';
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.lec-dialog')).toBeFalsy();
  });

  it('al primo passaggio chiede se il problema è risolto, non se si vuole chiudere', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_resolved';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lec-dialog')).toBeTruthy();
    expect(el.querySelectorAll('.lec-btn')).toHaveLength(2);
  });

  it('al secondo passaggio mostra la conferma di chiusura', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_close';
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.lec-btn--danger')).toBeTruthy();
  });

  it('"Sì" al primo passaggio emette advance, non confirm — non chiude ancora nulla', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_resolved';
    fixture.detectChanges();

    let advanced = false;
    let confirmed = false;
    fixture.componentInstance.advance.subscribe(() => (advanced = true));
    fixture.componentInstance.confirm.subscribe(() => (confirmed = true));

    (fixture.nativeElement.querySelector('.lec-btn--primary') as HTMLButtonElement).click();

    expect(advanced).toBe(true);
    expect(confirmed).toBe(false);
  });

  it('"No" al primo passaggio annulla (cancel), non fa avanzare', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_resolved';
    fixture.detectChanges();

    let cancelled = false;
    let advanced = false;
    fixture.componentInstance.cancel.subscribe(() => (cancelled = true));
    fixture.componentInstance.advance.subscribe(() => (advanced = true));

    (fixture.nativeElement.querySelector('.lec-btn--secondary') as HTMLButtonElement).click();

    expect(cancelled).toBe(true);
    expect(advanced).toBe(false);
  });

  it('"Sì, chiudi" al secondo passaggio emette confirm', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_close';
    fixture.detectChanges();

    let confirmed = false;
    fixture.componentInstance.confirm.subscribe(() => (confirmed = true));

    (fixture.nativeElement.querySelector('.lec-btn--danger') as HTMLButtonElement).click();

    expect(confirmed).toBe(true);
  });

  it('il click sullo sfondo annulla, come il pulsante "No"', () => {
    const fixture = create();
    fixture.componentInstance.step = 'ask_close';
    fixture.detectChanges();

    let cancelled = false;
    fixture.componentInstance.cancel.subscribe(() => (cancelled = true));

    (fixture.nativeElement.querySelector('.lec-backdrop') as HTMLElement).click();

    expect(cancelled).toBe(true);
  });
});
