import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { TranslationHealthPanelComponent, issueLabel } from './translation-health-panel.component';
import { TranslationHealth } from '../admin-dashboard.service';

const DATA: TranslationHealth = {
  posts: 12,
  postsWithIssues: 2,
  missing: 1,
  stale: 1,
  structure: 1,
  byLang: {
    en: { missing: 0, stale: 0, structure: 0 }, sq: { missing: 0, stale: 0, structure: 1 }, pt: { missing: 1, stale: 0, structure: 0 },
    es: { missing: 0, stale: 1, structure: 0 }, fr: { missing: 0, stale: 0, structure: 0 }, de: { missing: 0, stale: 0, structure: 0 },
  },
  items: [
    { _id: 'p1', title: 'Migrazione Angular', slug: 'migrazione', published: true, issues: [{ lang: 'sq', kind: 'structure', detail: ['pre 12/13'] }, { lang: 'es', kind: 'stale' }] },
    { _id: 'p2', title: 'Bozza', slug: 'bozza', published: false, issues: [{ lang: 'pt', kind: 'missing' }] },
  ],
};

describe('issueLabel', () => {
  it('uses one mark per problem kind', () => {
    expect(issueLabel({ lang: 'en', kind: 'missing' })).toBe('EN ✕');
    expect(issueLabel({ lang: 'sq', kind: 'stale' })).toBe('SQ ⟳');
    expect(issueLabel({ lang: 'pt', kind: 'structure' })).toBe('PT ≠');
  });
});

describe('TranslationHealthPanelComponent', () => {
  function render(data: TranslationHealth) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TranslationHealthPanelComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists each post with one chip per problem, linking to the editor', () => {
    const el = render(DATA);
    const link = el.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toContain('Migrazione Angular');
    expect(link.getAttribute('href')).toBe('/dashboard/blog?edit=p1');
    expect(el.textContent).toContain('SQ ≠');
    expect(el.textContent).toContain('ES ⟳');
    expect(el.querySelector('.panel-badge--bad')?.textContent).toContain('PT ✕');
  });

  it('says everything is fine when no post has problems', () => {
    const el = render({ ...DATA, postsWithIssues: 0, missing: 0, stale: 0, structure: 0, items: [] });
    expect(el.textContent).toContain('translation_health.all_ok');
  });
});
