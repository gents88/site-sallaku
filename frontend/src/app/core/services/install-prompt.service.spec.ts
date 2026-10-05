import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BeforeInstallPromptEvent,
  DISMISS_COOLDOWN_MS,
  INSTALL_DISMISSED_KEY,
  InstallPromptService,
  LAB_USES_KEY,
} from './install-prompt.service';
import { PlatformUiService } from './platform-ui.service';

@Component({ standalone: true, template: '' })
class Blank {}

function setup(opts: { ios?: boolean; platform?: 'browser' | 'server' } = {}) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'lab', component: Blank },
        { path: 'lab/:tool', component: Blank },
        { path: ':lang/lab/:tool', component: Blank },
        { path: 'blog', component: Blank },
      ]),
      { provide: PLATFORM_ID, useValue: opts.platform ?? 'browser' },
      { provide: PlatformUiService, useValue: { isIos: () => !!opts.ios } },
    ],
  });
  return { svc: TestBed.inject(InstallPromptService), router: TestBed.inject(Router) };
}

function firePrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  window.dispatchEvent(event);
  return { event, prompt };
}

describe('InstallPromptService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('captures beforeinstallprompt, suppressing the browser mini-infobar', () => {
    const { svc } = setup();
    expect(svc.canPromptNatively()).toBe(false);
    const { event } = firePrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(svc.canPromptNatively()).toBe(true);
    expect(svc.installable()).toBe(true);
  });

  it('offers installation only from the second Lab tool opened', async () => {
    const { svc, router } = setup();
    firePrompt();
    await router.navigateByUrl('/lab');
    await router.navigateByUrl('/blog');
    expect(svc.shouldOffer()).toBe(false);
    await router.navigateByUrl('/lab/ocr');
    expect(svc.shouldOffer()).toBe(false);
    await router.navigateByUrl('/en/lab/pdf-translate');
    expect(svc.shouldOffer()).toBe(true);
    expect(localStorage.getItem(LAB_USES_KEY)).toBe('2');
  });

  it('remembers Lab usage across visits', () => {
    localStorage.setItem(LAB_USES_KEY, '5');
    const { svc } = setup();
    firePrompt();
    expect(svc.shouldOffer()).toBe(true);
  });

  it('opens the native dialog and stops offering once installed', async () => {
    localStorage.setItem(LAB_USES_KEY, '3');
    const { svc } = setup();
    const { prompt } = firePrompt('accepted');
    await expect(svc.install()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalled();
    expect(svc.installable()).toBe(false);
    expect(svc.shouldOffer()).toBe(false);
  });

  it('treats a dismissed native dialog like "Not now"', async () => {
    localStorage.setItem(LAB_USES_KEY, '3');
    const { svc } = setup();
    firePrompt('dismissed');
    await expect(svc.install()).resolves.toBe(false);
    expect(Number(localStorage.getItem(INSTALL_DISMISSED_KEY))).toBeGreaterThan(0);
  });

  it('stays quiet for 30 days after "Not now", then offers again', () => {
    localStorage.setItem(LAB_USES_KEY, '3');
    const { svc } = setup();
    firePrompt();
    svc.dismiss();
    expect(svc.shouldOffer()).toBe(false);
    expect(svc.installable()).toBe(true); // l'azione esplicita resta disponibile

    TestBed.resetTestingModule();
    localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now() - DISMISS_COOLDOWN_MS - 1000));
    const again = setup().svc;
    firePrompt();
    expect(again.shouldOffer()).toBe(true);
  });

  it('falls back to manual instructions on iOS Safari', () => {
    localStorage.setItem(LAB_USES_KEY, '2');
    const { svc } = setup({ ios: true });
    expect(svc.canPromptNatively()).toBe(false);
    expect(svc.iosManual()).toBe(true);
    expect(svc.shouldOffer()).toBe(true);
  });

  it('install() is a no-op without a captured event', async () => {
    const { svc } = setup();
    await expect(svc.install()).resolves.toBe(false);
  });

  it('never offers anything while prerendering', () => {
    localStorage.setItem(LAB_USES_KEY, '9');
    const { svc } = setup({ platform: 'server', ios: true });
    expect(svc.installable()).toBe(false);
    expect(svc.shouldOffer()).toBe(false);
  });
});
