import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { LangSwitcherComponent } from './lang-switcher.component';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';

describe('LangSwitcherComponent', () => {
  function create(url: string, alternatePath: (lang: string) => string | null) {
    const router = { url, navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: LanguageService, useValue: { current: () => 'it', persistChoice: vi.fn(), setLang: vi.fn() } },
        { provide: SeoService, useValue: { alternatePath: vi.fn(alternatePath) } },
      ],
    });
    const component = TestBed.createComponent(LangSwitcherComponent).componentInstance;
    return { component, router };
  }

  it('switches a blog post to the translated slug of the target language', () => {
    const { component, router } = create('/blog/blinisht-storia', lang => (lang === 'sq' ? '/blog/blinishti-historia' : null));

    component.select('sq');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/sq/blog/blinishti-historia');
  });

  it('keeps the same path on pages without translated paths', () => {
    const { component, router } = create('/sq/projects', () => null);

    component.select('en');

    expect(router.navigateByUrl).toHaveBeenCalledWith('/en/projects');
  });
});
