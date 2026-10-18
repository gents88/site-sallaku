import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsentBannerComponent } from './consent-banner.component';
import { ConsentService } from '../../../core/services/consent.service';
import { LanguageService } from '../../../core/services/language.service';

type Choice = { analytics: boolean; marketing: boolean; preferences: boolean };

/** Finto ConsentService con la stessa reattività del vero: setConsent aggiorna state(). */
function fakeConsent(initial: Choice | null) {
  const state = signal<Choice | null>(initial);
  const reopenRequested = signal(0);
  return {
    state,
    reopenRequested,
    hasDecided: () => state() !== null,
    setConsent: vi.fn((c: Choice) => state.set({ ...c })),
    openPreferences: () => reopenRequested.update(v => v + 1),
  };
}

function setup(initial: Choice | null = null) {
  const consent = fakeConsent(initial);
  TestBed.configureTestingModule({
    imports: [ConsentBannerComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ConsentService, useValue: consent },
      { provide: LanguageService, useValue: { current: signal('it') } },
    ],
  });
  const fixture = TestBed.createComponent(ConsentBannerComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const render = async () => {
    TestBed.tick();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, el, consent, render };
}

const NONE: Choice = { analytics: false, marketing: false, preferences: false };
const ALL: Choice = { analytics: true, marketing: true, preferences: true };

describe('ConsentBannerComponent', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    document.documentElement.removeAttribute('data-cookie-banner-open');
    TestBed.resetTestingModule();
  });

  it('mostra il banner al primo accesso e segna <html> per footer e chat', async () => {
    const { el, render } = setup(null);
    await render();
    expect(el.querySelector('.consent-banner')).not.toBeNull();
    expect(document.documentElement.hasAttribute('data-cookie-banner-open')).toBe(true);
  });

  it('non mostra il banner se la scelta è già salvata', async () => {
    const { el, render } = setup(NONE);
    await render();
    expect(el.querySelector('.consent-banner')).toBeNull();
    expect(document.documentElement.hasAttribute('data-cookie-banner-open')).toBe(false);
  });

  it('"Accetta tutto" e "Rifiuta tutto" salvano e chiudono il banner', async () => {
    const accept = setup(null);
    accept.el.querySelector<HTMLButtonElement>('.consent-banner .cbtn--primary')!.click();
    await accept.render();
    expect(accept.consent.setConsent).toHaveBeenCalledWith(ALL);
    expect(accept.el.querySelector('.consent-banner')).toBeNull();
    TestBed.resetTestingModule();

    const reject = setup(null);
    reject.el.querySelector<HTMLButtonElement>('.consent-banner .cbtn--secondary')!.click();
    await reject.render();
    expect(reject.consent.setConsent).toHaveBeenCalledWith(NONE);
    expect(reject.el.querySelector('.consent-banner')).toBeNull();
  });

  it('regressione: riaperta dal footer, "Salva preferenze" chiude la modale e non la riapre', async () => {
    const { el, consent, render } = setup(NONE);
    consent.openPreferences();
    await render();
    expect(el.querySelector('.consent-modal')).not.toBeNull();

    const analytics = el.querySelector<HTMLInputElement>('#consent-analytics')!;
    analytics.click();
    el.querySelector<HTMLButtonElement>('.consent-modal__actions .cbtn--ghost')!.click();
    await render();
    // Un secondo giro: è qui che l'effect, rieseguito dal cambio di state(), la riapriva.
    await render();

    expect(consent.setConsent).toHaveBeenCalledWith({ analytics: true, marketing: false, preferences: false });
    expect(el.querySelector('.consent-modal')).toBeNull();
  });

  it('precompila gli interruttori con la scelta salvata', async () => {
    const { el, consent, render } = setup({ analytics: true, marketing: false, preferences: true });
    consent.openPreferences();
    await render();
    expect(el.querySelector<HTMLInputElement>('#consent-analytics')!.checked).toBe(true);
    expect(el.querySelector<HTMLInputElement>('#consent-marketing')!.checked).toBe(false);
    expect(el.querySelector<HTMLInputElement>('#consent-preferences')!.checked).toBe(true);
  });

  it('chiude con tap sullo sfondo, X ed Esc, ma non con un tap dentro il riquadro', async () => {
    const { el, consent, render } = setup(NONE);
    consent.openPreferences();
    await render();

    el.querySelector<HTMLElement>('.consent-modal__box')!.click();
    await render();
    expect(el.querySelector('.consent-modal')).not.toBeNull();

    el.querySelector<HTMLElement>('.consent-modal')!.click();
    await render();
    expect(el.querySelector('.consent-modal')).toBeNull();

    consent.openPreferences();
    await render();
    el.querySelector<HTMLButtonElement>('.consent-modal__x')!.click();
    await render();
    expect(el.querySelector('.consent-modal')).toBeNull();

    consent.openPreferences();
    await render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await render();
    expect(el.querySelector('.consent-modal')).toBeNull();
    expect(consent.setConsent).not.toHaveBeenCalled();
  });

  it('"Accetta tutto" dentro la modale chiude sia la modale sia il banner', async () => {
    const { el, render, consent } = setup(null);
    el.querySelector<HTMLButtonElement>('.consent-banner__manage')!.click();
    await render();
    el.querySelector<HTMLButtonElement>('.consent-modal__actions .cbtn--primary')!.click();
    await render();
    expect(consent.setConsent).toHaveBeenCalledWith(ALL);
    expect(el.querySelector('.consent-modal')).toBeNull();
    expect(el.querySelector('.consent-banner')).toBeNull();
  });

  it('blocca lo scroll della pagina solo mentre la modale è aperta', async () => {
    document.body.style.overflow = 'auto';
    const { el, consent, render } = setup(NONE);
    consent.openPreferences();
    await render();
    expect(document.body.style.overflow).toBe('hidden');
    el.querySelector<HTMLButtonElement>('.consent-modal__x')!.click();
    await render();
    expect(document.body.style.overflow).toBe('auto');
  });
});
