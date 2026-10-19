import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactComponent } from './contact.component';
import { FeatureFlagsService } from '../../core/services/feature-flags.service';

describe('ContactComponent — validazione accessibile', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [ContactComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: FeatureFlagsService, useValue: { contactFormEnabled: () => true } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function submitEmpty() {
    const fixture = TestBed.createComponent(ContactComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    fixture.detectChanges();
    return { fixture, el };
  }

  it('prima dell\'invio nessun campo è segnato come errato', () => {
    const fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[aria-invalid="true"]').length).toBe(0);
    expect(el.querySelectorAll('.field-error').length).toBe(0);
  });

  it('all\'invio vuoto ogni campo errato ha aria-invalid e punta al proprio messaggio', async () => {
    const { fixture, el } = await submitEmpty();
    for (const id of ['contact-name', 'contact-email', 'contact-subject', 'contact-message', 'contact-privacy']) {
      const control = el.querySelector(`#${id}`) as HTMLElement;
      expect(control.getAttribute('aria-invalid'), id).toBe('true');
      const errId = control.getAttribute('aria-describedby');
      expect(errId, id).toBe(`${id}-err`);
      expect(el.querySelector(`#${errId}`)?.getAttribute('role')).toBe('alert');
    }
    fixture.nativeElement.remove();
  });

  it('porta il focus sul primo campo errato (il nome)', async () => {
    const { fixture } = await submitEmpty();
    expect(document.activeElement?.id).toBe('contact-name');
    fixture.nativeElement.remove();
  });

  it('nome ed email dichiarano l\'autocomplete (WCAG 1.3.5)', () => {
    const fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#contact-name')?.getAttribute('autocomplete')).toBe('name');
    expect(el.querySelector('#contact-email')?.getAttribute('autocomplete')).toBe('email');
  });
});
