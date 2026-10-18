import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { MaintenanceOverlayComponent, isMaintenanceExempt } from './maintenance-overlay.component';
import { DEFAULT_FEATURE_FLAGS, FeatureFlags, FeatureFlagsService } from '../../../core/services/feature-flags.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthModalService } from '../../../core/services/auth-modal.service';

describe('isMaintenanceExempt', () => {
  it('exempts only the admin area', () => {
    expect(isMaintenanceExempt('/dashboard')).toBe(true);
    expect(isMaintenanceExempt('/dashboard/login')).toBe(true);
    expect(isMaintenanceExempt('/dashboard?x=1')).toBe(true);
    expect(isMaintenanceExempt('/dashboardx')).toBe(false);
    expect(isMaintenanceExempt('/blog')).toBe(false);
    expect(isMaintenanceExempt('/')).toBe(false);
  });
});

describe('MaintenanceOverlayComponent', () => {
  function setup(opts: { maintenance: boolean; admin: boolean; message?: string }) {
    const flags = signal<FeatureFlags>({
      ...DEFAULT_FEATURE_FLAGS,
      maintenanceMode: opts.maintenance,
      maintenanceMessage: opts.message ?? '',
    });
    const openLogin = { called: 0 };
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: FeatureFlagsService, useValue: { flags, maintenanceMode: computed(() => flags().maintenanceMode) } },
        { provide: AuthService, useValue: { isAdmin: signal(opts.admin) } },
        { provide: AuthModalService, useValue: { openLogin: () => openLogin.called++ } },
      ],
    });
    const fixture = TestBed.createComponent(MaintenanceOverlayComponent);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, openLogin, router: TestBed.inject(Router) };
  }

  it('shows nothing when maintenance is off', () => {
    const { el } = setup({ maintenance: false, admin: false });
    expect(el.textContent?.trim()).toBe('');
  });

  it('covers the page for visitors, with the custom message and an admin login link', () => {
    const { el, openLogin } = setup({ maintenance: true, admin: false, message: 'Torno alle 18' });
    expect(el.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(el.textContent).toContain('Torno alle 18');
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(openLogin.called).toBe(1);
  });

  it('lets admins see the site, with only a reminder pill', () => {
    const { el } = setup({ maintenance: true, admin: true });
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(el.textContent).toContain('maintenance.admin_notice');
  });
});
