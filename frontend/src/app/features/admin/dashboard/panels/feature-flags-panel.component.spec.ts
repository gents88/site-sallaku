import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { FeatureFlagsPanelComponent } from './feature-flags-panel.component';
import { DEFAULT_FEATURE_FLAGS, FeatureFlags, FeatureFlagsService } from '../../../../core/services/feature-flags.service';

describe('FeatureFlagsPanelComponent', () => {
  function setup(update: (patch: Partial<FeatureFlags>) => unknown) {
    const flags = signal<FeatureFlags>({ ...DEFAULT_FEATURE_FLAGS, maintenanceMessage: 'salvato' });
    const service = { flags, update: vi.fn(update), refresh: vi.fn() };
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: FeatureFlagsService, useValue: service }],
    });
    const fixture = TestBed.createComponent(FeatureFlagsPanelComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = (key: string) => el.querySelector(`#flag-${key}`) as HTMLInputElement;
    return { fixture, el, service, flags, input };
  }

  it('renders one switch per flag reflecting the current state', () => {
    const { el, input } = setup(() => of(DEFAULT_FEATURE_FLAGS));
    expect(el.querySelectorAll('input[role="switch"]').length).toBe(7);
    expect(input('aiEnabled').checked).toBe(true);
    expect(input('maintenanceMode').checked).toBe(false);
  });

  it('sends only the toggled flag', () => {
    const { service, input } = setup(() => of(DEFAULT_FEATURE_FLAGS));
    const sw = input('chatbotEnabled');
    sw.checked = false;
    sw.dispatchEvent(new Event('change'));
    expect(service.update).toHaveBeenCalledWith({ chatbotEnabled: false });
  });

  it('flips the switch back and shows an error when saving fails', () => {
    const result = new Subject<FeatureFlags>();
    const { fixture, el, input } = setup(() => result);
    const sw = input('aiEnabled');
    sw.checked = false;
    sw.dispatchEvent(new Event('change'));

    result.error(new Error('500'));
    fixture.detectChanges();

    expect(sw.checked).toBe(true);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('prefills the maintenance message with the saved one and saves it trimmed', () => {
    const { fixture, el, service } = setup(() => of(DEFAULT_FEATURE_FLAGS));
    fixture.detectChanges();
    expect(fixture.componentInstance.message).toBe('salvato');

    fixture.componentInstance.message = '  nuovo testo  ';
    fixture.componentInstance.saveMessage();
    expect(service.update).toHaveBeenCalledWith({ maintenanceMessage: 'nuovo testo' });
    expect(el).toBeTruthy();
  });
});
