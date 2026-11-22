import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { SeoSectionComponent, gscPagePath } from './seo-section.component';

describe('SeoSectionComponent', () => {
  it('mostra totali, ricerche e pagine con più clic da Google', () => {
    TestBed.configureTestingModule({ imports: [SeoSectionComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(SeoSectionComponent);
    fixture.componentRef.setInput('gsc', {
      configured: true, clicks: 25, impressions: 1200, avgCtr: 2.08, avgPosition: 9.5,
      topQueries: [{ query: 'gent sallaku', clicks: 8, impressions: 100, ctr: 8, position: 2.3 }],
      topPages: [{ page: 'https://gentsallaku.it/en/blog/rxjs', clicks: 6, impressions: 90, ctr: 6.67, position: 4 }],
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('1,200');
    expect(text).toContain('gent sallaku');
    expect(text).toContain('/en/blog/rxjs');
    expect(text).toContain('dashboard_ux.period_28d');
  });

  it('riduce l\'URL di Search Console al percorso', () => {
    expect(gscPagePath('https://gentsallaku.it/de/blog/%C3%BCber')).toBe('/de/blog/über');
    expect(gscPagePath('non-un-url')).toBe('non-un-url');
  });
});
