import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { InstallPromptComponent } from './install-prompt.component';
import { InstallPromptService } from '../../../core/services/install-prompt.service';

function setup(native: boolean) {
  const install = {
    shouldOffer: signal(true),
    canPromptNatively: signal(native),
    install: vi.fn(() => Promise.resolve(true)),
    dismiss: vi.fn(),
  };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [{ provide: InstallPromptService, useValue: install }],
  });
  const fixture = TestBed.createComponent(InstallPromptComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, install };
}

describe('InstallPromptComponent', () => {
  it('shows the Install button when the browser supports the native dialog', async () => {
    const { fixture, el, install } = setup(true);
    const button = el.querySelector<HTMLButtonElement>('.btn-primary')!;
    expect(button.textContent).toContain('install.cta');
    button.click();
    await fixture.whenStable();
    expect(install.install).toHaveBeenCalled();
    expect(el.querySelector('.install-card')).toBeNull();
  });

  it('shows the Share → Add to Home Screen steps on iOS', () => {
    const { el } = setup(false);
    expect(el.querySelector('.btn-primary')).toBeNull();
    expect(el.textContent).toContain('install.ios_share');
  });

  it('"Not now" hides the card and records the dismissal', async () => {
    const { fixture, el, install } = setup(true);
    el.querySelector<HTMLButtonElement>('.btn-ghost')!.click();
    await fixture.whenStable();
    expect(install.dismiss).toHaveBeenCalled();
    expect(el.querySelector('.install-card')).toBeNull();
  });

  it('renders nothing when it is not the right moment', () => {
    const { fixture, el, install } = setup(true);
    install.shouldOffer.set(false);
    fixture.detectChanges();
    expect(el.querySelector('.install-card')).toBeNull();
  });
});
