import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FooterComponent } from './footer.component';
import { ConsentService } from '../../../core/services/consent.service';
import { OnboardingTourService } from '../../../core/onboarding/onboarding-tour.service';
import { LanguageService } from '../../../core/services/language.service';

async function setup(url: string, lang: 'it' | 'en' = 'it') {
  const tour = { start: vi.fn(async () => undefined) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ConsentService, useValue: { openPreferences: vi.fn() } },
      { provide: OnboardingTourService, useValue: tour },
      { provide: LanguageService, useValue: { current: signal(lang) } },
    ],
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(FooterComponent);
  fixture.detectChanges();
  return { fixture, router, tour, el: fixture.nativeElement as HTMLElement };
}

describe('FooterComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('il link email punta all\'indirizzo vero (regressione: mailto verso gent.sallaku@email.com)', async () => {
    const { el } = await setup('/');
    expect(el.querySelector('a[aria-label="Email"]')?.getAttribute('href')).toBe('mailto:gentsallaku@gmail.com');
  });

  it('linka le Testimonianze, uscite dal menu principale', async () => {
    const { el } = await setup('/');
    expect(el.querySelector('.footer-nav a[href="/testimonials"]')).not.toBeNull();
  });

  it('"Guida" da una pagina del portfolio passa dal Lab, dove c\'è la sidebar che il tour spiega', async () => {
    const { fixture, router, tour } = await setup('/en/blog', 'en');
    await fixture.componentInstance.startGuide();
    expect(router.url).toBe('/en/lab');
    expect(tour.start).toHaveBeenCalledOnce();
  });

  it('"Guida" nel Lab parte subito, senza cambiare pagina', async () => {
    const { fixture, router, tour } = await setup('/lab/ocr');
    await fixture.componentInstance.startGuide();
    expect(router.url).toBe('/lab/ocr');
    expect(tour.start).toHaveBeenCalledOnce();
  });
});
