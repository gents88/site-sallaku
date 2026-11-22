import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { ActivitySectionComponent, dayBarHeight } from './activity-section.component';

describe('ActivitySectionComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [ActivitySectionComponent, TranslateModule.forRoot()], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ActivitySectionComponent);
    fixture.componentRef.setInput('contactBars', [{ date: '2026-11-20', value: 1 }, { date: '2026-11-21', value: 4 }]);
    fixture.componentRef.setInput('publishedPosts', 3);
    fixture.componentRef.setInput('draftPosts', 1);
    fixture.componentRef.setInput('topPosts', [{ _id: 'p1', title: 'RxJS', slug: 'rxjs', viewCount: 12 }]);
    fixture.componentRef.setInput('consent', { total: 10, analyticsRate: 0.5, marketingRate: 0.2, preferencesRate: 0.7 });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('mostra grafici, contenuti, articoli più letti e consensi con il loro periodo', () => {
    const { el, fixture } = setup();
    expect(el.querySelectorAll('.contact-chart__item').length).toBe(2);
    expect(fixture.componentInstance.publishedPercent()).toBe(75);
    expect(el.textContent).toContain('RxJS');
    expect(el.textContent).toContain('50%');
    expect(el.textContent).toContain('dashboard_ux.period_7d');
    expect(el.textContent).toContain('dashboard_ux.period_all_time');
  });

  it('il pulsante dei consensi chiede di aggiornare', () => {
    const { el, fixture } = setup();
    const refresh = vi.fn();
    fixture.componentInstance.refresh.subscribe(refresh);
    (el.querySelector('.btn') as HTMLButtonElement).click();
    expect(refresh).toHaveBeenCalled();
  });

  it('le colonne non scendono mai a zero', () => {
    const bars = [{ date: 'a', value: 0 }, { date: 'b', value: 10 }];
    expect(dayBarHeight(0, bars)).toBe('8%');
    expect(dayBarHeight(1, bars)).toBe('18%');
    expect(dayBarHeight(10, bars)).toBe('100%');
  });
});
