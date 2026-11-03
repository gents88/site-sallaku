import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { TermsComponent } from './terms.component';
import { SeoService } from '../../../core/services/seo.service';
import { LanguageService } from '../../../core/services/language.service';

describe('TermsComponent', () => {
  function render(lang: 'it' | 'de' = 'it') {
    const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) };
    TestBed.configureTestingModule({
      imports: [TermsComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SeoService, useValue: seo },
        { provide: LanguageService, useValue: { current: () => lang } },
      ],
    });
    const fixture = TestBed.createComponent(TermsComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, seo };
  }

  it('mostra tutte le 12 sezioni', () => {
    const { el } = render();
    const headings = Array.from(el.querySelectorAll('h2')).map(h => h.textContent?.trim());
    expect(headings).toHaveLength(12);
    expect(headings[0]).toBe('terms.s1_title');
    expect(headings[11]).toBe('terms.s12_title');
  });

  it('rimanda alla Privacy Policy nella lingua corrente', () => {
    const { el } = render('de');
    expect(el.querySelector('a[href="/de/privacy-policy"]')).not.toBeNull();
  });

  it('canonical sulla URL della lingua, pagina indicizzabile', () => {
    const { seo } = render('de');
    expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://gentsallaku.it/de/terms' }));
    expect(seo.update.mock.calls[0][0]).not.toHaveProperty('noindex', true);
  });
});
