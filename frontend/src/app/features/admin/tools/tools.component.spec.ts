import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { ToolsComponent } from './tools.component';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';

function setup(lang: string) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: LanguageService, useValue: { current: () => lang } },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
    ],
  });
  const fixture = TestBed.createComponent(ToolsComponent);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
}

describe('ToolsComponent (Lab)', () => {
  it('builds its cards from the navigation registry, same order as the sidebar', () => {
    const { component } = setup('it');
    expect(component.aiCards.map(c => c.route)).toEqual([
      '/lab/pdf-search', '/lab/library', '/lab/pdf-summary', '/lab/ai-formatter', '/lab/pdf-translate', '/lab/ai-ppt',
    ]);
    expect(component.toolCards).toHaveLength(6);
  });

  it('keeps the language prefix on card links (regression: /en/lab linked to Italian pages)', () => {
    const { el } = setup('en');
    const hrefs = Array.from(el.querySelectorAll('a.tool-card, a.workspace-banner')).map(a => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every(h => h?.startsWith('/en/lab/'))).toBe(true);
  });
});
