import { importProvidersFrom } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LiveHandoffPromptComponent } from './live-handoff-prompt.component';

describe('LiveHandoffPromptComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [importProvidersFrom(TranslateModule.forRoot())],
    });
  });

  function create() {
    const fixture = TestBed.createComponent(LiveHandoffPromptComponent);
    return fixture;
  }

  it('mostra il banner completo quando lo stato è "prompt_shown" e non è minimizzato', () => {
    const fixture = create();
    fixture.componentInstance.state = 'prompt_shown';
    fixture.componentInstance.minimized = false;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lhp-banner')).toBeTruthy();
    expect(el.querySelector('.lhp-pill')).toBeFalsy();
  });

  it('mostra la pillola minimizzata invece del banner dopo l’auto-minimizzazione', () => {
    const fixture = create();
    fixture.componentInstance.state = 'prompt_shown';
    fixture.componentInstance.minimized = true;
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lhp-banner')).toBeFalsy();
    expect(el.querySelector('.lhp-pill')).toBeTruthy();
  });

  it('mostra la pillola di attesa per "request_sent", senza il banner', () => {
    const fixture = create();
    fixture.componentInstance.state = 'request_sent';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lhp-pill--waiting')).toBeTruthy();
    expect(el.querySelector('.lhp-banner')).toBeFalsy();
  });

  it('mostra la pillola di attesa anche per "agent_joining"', () => {
    const fixture = create();
    fixture.componentInstance.state = 'agent_joining';
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.lhp-pill--waiting')).toBeTruthy();
    expect(el.querySelector('.lhp-banner')).toBeFalsy();
  });

  it('non mostra nulla per gli stati idle, live, expired e closed', () => {
    const fixture = create();
    for (const state of ['idle', 'live', 'expired', 'closed'] as const) {
      fixture.componentInstance.state = state;
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.lhp-banner')).toBeFalsy();
      expect(el.querySelector('.lhp-pill')).toBeFalsy();
    }
  });

  it('emette accept/decline dai pulsanti del banner', () => {
    const fixture = create();
    fixture.componentInstance.state = 'prompt_shown';
    fixture.componentInstance.minimized = false;
    fixture.detectChanges();

    let acceptCalled = false;
    let declineCalled = false;
    fixture.componentInstance.accept.subscribe(() => (acceptCalled = true));
    fixture.componentInstance.decline.subscribe(() => (declineCalled = true));

    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.lhp-btn--primary') as HTMLButtonElement).click();
    (el.querySelector('.lhp-btn--secondary') as HTMLButtonElement).click();

    expect(acceptCalled).toBe(true);
    expect(declineCalled).toBe(true);
  });

  it('emette reopen quando si clicca sulla pillola minimizzata', () => {
    const fixture = create();
    fixture.componentInstance.state = 'prompt_shown';
    fixture.componentInstance.minimized = true;
    fixture.detectChanges();

    let reopenCalled = false;
    fixture.componentInstance.reopen.subscribe(() => (reopenCalled = true));

    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.lhp-pill') as HTMLButtonElement).click();

    expect(reopenCalled).toBe(true);
  });
});
