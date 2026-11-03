import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundComponent } from './not-found.component';
import { SeoService } from '../../core/services/seo.service';
import { LanguageService } from '../../core/services/language.service';

describe('NotFoundComponent', () => {
  function render() {
    const seo = { update: vi.fn() };
    TestBed.configureTestingModule({
      imports: [NotFoundComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SeoService, useValue: seo },
        { provide: LanguageService, useValue: { current: () => 'en' } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { page_not_found: { title: 'Page not found', home: 'Home', blog: 'Blog', lab: 'Lab', text: 'x' } });
    translate.use('en');
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, seo };
  }

  it('è noindex, con il titolo tradotto', () => {
    const { seo } = render();
    expect(seo.update).toHaveBeenCalledWith({ title: 'Page not found', noindex: true });
  });

  it('offre la strada verso home, blog e Lab nella lingua corrente', () => {
    const { el } = render();
    expect(el.querySelector('h1')?.textContent).toContain('Page not found');
    const hrefs = Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/en', '/en/blog', '/en/lab']);
  });
});
