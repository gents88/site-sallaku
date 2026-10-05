import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSwitchService } from './language-switch.service';
import { LanguageService } from './language.service';
import { SeoService } from './seo.service';

function setup(url: string, alternatePath: (lang: string) => string | null = () => null) {
  const router = { url, navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  const lang = { persistChoice: vi.fn(), setLang: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: LanguageService, useValue: lang },
      { provide: SeoService, useValue: { alternatePath: vi.fn(alternatePath) } },
    ],
  });
  return { svc: TestBed.inject(LanguageSwitchService), router, lang };
}

describe('LanguageSwitchService', () => {
  it('follows the translated slug of a blog post', async () => {
    const { svc, router } = setup('/blog/storia?x=1', l => (l === 'sq' ? '/blog/historia' : null));
    await svc.switchTo('sq');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/sq/blog/historia');
  });

  it('persists Italian before navigating to the unprefixed URL', async () => {
    const { svc, router, lang } = setup('/en/projects');
    await svc.switchTo('it');
    expect(lang.persistChoice).toHaveBeenCalledWith('it');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/projects');
  });

  it('only changes the client language inside the dashboard', async () => {
    const { svc, router, lang } = setup('/dashboard/blog');
    await svc.switchTo('en');
    expect(lang.setLang).toHaveBeenCalledWith('en');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not throw when the navigation is rejected', async () => {
    const { svc, router } = setup('/blog');
    router.navigateByUrl.mockReturnValue(Promise.reject(new Error('guard')));
    await expect(svc.switchTo('fr')).resolves.toBeUndefined();
  });
});
