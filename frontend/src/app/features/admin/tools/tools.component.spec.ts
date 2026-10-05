import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { ToolsComponent } from './tools.component';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';

function setup(lang: string, before?: () => void) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: LanguageService, useValue: { current: () => lang } },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) } },
    ],
  });
  before?.();
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

  describe('pick up where you left off', () => {
    it('lists the recently used tools, with language prefix', () => {
      localStorage.setItem('gs.lab-recent-tools', JSON.stringify([{ id: 'ocr', usedAt: 2 }, { id: 'pdf-summary', usedAt: 1 }]));
      const { el } = setup('en');
      const hrefs = Array.from(el.querySelectorAll('.resume a.tool-card')).map(a => a.getAttribute('href'));
      expect(hrefs).toEqual(['/en/lab/ocr', '/en/lab/pdf-summary']);
      localStorage.clear();
    });

    it('offers where to open the file waiting in the workspace', () => {
      localStorage.clear();
      const { el } = setup('it', () =>
        TestBed.inject(WorkspaceService).send({ kind: 'text', text: 'x', filename: 'ocr-text.txt', fromTool: 'ocr' }));
      expect(el.querySelector('.resume-pending')?.textContent).toContain('lab_next.pending');
      expect(Array.from(el.querySelectorAll('.resume-chip')).map(a => a.getAttribute('href'))).toEqual(['/lab/ai-formatter', '/lab/editor']);
    });

    it('shows nothing on a first visit', () => {
      localStorage.clear();
      const { el } = setup('it');
      expect(el.querySelector('.resume')).toBeNull();
    });
  });
});
