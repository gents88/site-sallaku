import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { SidebarComponent } from './sidebar.component';
import { AuthService } from '../../../core/services/auth.service';
import { DrawerService } from '../../../core/services/drawer.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { LanguageService } from '../../../core/services/language.service';

function setup(admin: boolean) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { isLoggedIn: signal(admin), isAdmin: signal(admin) } },
      { provide: DrawerService, useValue: { mode: signal('rail'), drawerOpen: signal(false), expanded: signal(true), close: vi.fn(), toggleRail: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
      { provide: LanguageService, useValue: { current: () => 'it' } },
    ],
  });
  const fixture = TestBed.createComponent(SidebarComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SidebarComponent', () => {
  it('renders the public tools from the registry for visitors, without admin groups', () => {
    const el = setup(false);
    const hrefs = Array.from(el.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/lab/library');
    expect(hrefs).not.toContain('/dashboard/blog');
  });

  it('adds overview and content management for admins', () => {
    const el = setup(true);
    const hrefs = Array.from(el.querySelectorAll('a.nav-item')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/dashboard', '/dashboard/blog', '/dashboard/newsletter']));
  });

  it('exposes a single labelled navigation landmark (no role on <aside>)', () => {
    const el = setup(false);
    expect(el.querySelector('aside')?.getAttribute('role')).toBeNull();
    expect(el.querySelectorAll('nav, [role="navigation"]')).toHaveLength(1);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBeTruthy();
  });

  it('renders SVG icons instead of emoji', () => {
    const el = setup(false);
    const icon = el.querySelector('a.nav-item .nav-icon');
    expect(icon?.querySelector('svg')).not.toBeNull();
    expect(icon?.textContent?.trim()).toBe('');
  });
});
