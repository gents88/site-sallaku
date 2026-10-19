import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestimonialsComponent } from './testimonials.component';

describe('TestimonialsComponent — validazione accessibile', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [TestimonialsComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('all\'invio vuoto segna errati nome e testo, li collega ai messaggi e porta il focus sul nome', async () => {
    const fixture = TestBed.createComponent(TestimonialsComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    fixture.detectChanges();

    for (const id of ['testimonial-name', 'testimonial-content']) {
      const control = el.querySelector(`#${id}`) as HTMLElement;
      expect(control.getAttribute('aria-invalid'), id).toBe('true');
      expect(control.getAttribute('aria-describedby'), id).toBe(`${id}-err`);
      expect(el.querySelector(`#${id}-err`)?.getAttribute('role')).toBe('alert');
    }
    expect(document.activeElement?.id).toBe('testimonial-name');
    // Il campo honeypot nascosto non deve mai ricevere il focus.
    expect((document.activeElement as HTMLElement).getAttribute('aria-hidden')).not.toBe('true');
    fixture.nativeElement.remove();
  });

  it('nome ed email dichiarano l\'autocomplete (WCAG 1.3.5)', () => {
    const fixture = TestBed.createComponent(TestimonialsComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#testimonial-name')?.getAttribute('autocomplete')).toBe('name');
    expect(el.querySelector('#testimonial-email')?.getAttribute('autocomplete')).toBe('email');
  });
});
