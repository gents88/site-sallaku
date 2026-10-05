import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineBannerComponent } from './offline-banner.component';
import { NetworkStatusService } from '../../../core/services/network-status.service';
import { LanguageService } from '../../../core/services/language.service';

describe('OfflineBannerComponent', () => {
  afterEach(() => vi.useRealTimers());

  function setup(initiallyOnline = true) {
    const online = signal(initiallyOnline);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: NetworkStatusService, useValue: { online } },
        { provide: LanguageService, useValue: { current: signal('it') } },
      ],
    });
    const fixture = TestBed.createComponent(OfflineBannerComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const render = () => { TestBed.tick(); fixture.detectChanges(); };
    return { online, el, render, component: fixture.componentInstance };
  }

  it('shows nothing while online', () => {
    const { el } = setup();
    expect(el.querySelector('.offline-banner')).toBeNull();
  });

  it('shows the offline banner with a link to the blog', () => {
    const { online, el, render } = setup();
    online.set(false);
    render();
    expect(el.textContent).toContain('offline.banner');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/blog');
  });

  it('confirms the reconnection briefly, then hides', () => {
    vi.useFakeTimers();
    const { online, el, render } = setup();
    online.set(false);
    render();
    online.set(true);
    render();
    expect(el.querySelector('.offline-banner--ok')?.textContent).toContain('offline.back_online');
    vi.advanceTimersByTime(3000);
    render();
    expect(el.querySelector('.offline-banner')).toBeNull();
  });

  it('does not announce "back online" on a normal page load', () => {
    const { component } = setup(true);
    expect(component.backOnline()).toBe(false);
  });
});
