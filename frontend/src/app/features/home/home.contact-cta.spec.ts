import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';

const REAL_EMAIL = 'mailto:gentsallaku@gmail.com';

describe('Sezione contatti della home', () => {
  beforeEach(() => {
    class FakeIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    TestBed.configureTestingModule({
      imports: [HomeComponent, FooterComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderHome(): HTMLElement {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('non contiene un secondo form: il modulo di contatto vero (Turnstile, privacy) è /contact', () => {
    const el = renderHome();
    expect(el.querySelector('#contact form')).toBeNull();
    expect(el.querySelector('#contact input, #contact textarea')).toBeNull();
  });

  it('rimanda a /contact con un link, non con un invio diretto', () => {
    const cta = renderHome().querySelector('#contact .contact-cta a.btn') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toMatch(/\/contact$/);
  });

  it('il link email della home usa l\'indirizzo reale, non un segnaposto', () => {
    const mails = Array.from(renderHome().querySelectorAll('a[href^="mailto:"]')).map(a => a.getAttribute('href'));
    expect(mails).toContain(REAL_EMAIL);
    expect(mails.some(m => m?.includes('@email.com'))).toBe(false);
  });

  it('il link email del footer (presente in ogni pagina) usa l\'indirizzo reale', () => {
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    const mails = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a[href^="mailto:"]'))
      .map(a => a.getAttribute('href'));
    expect(mails).toContain(REAL_EMAIL);
    expect(mails.some(m => m?.includes('@email.com'))).toBe(false);
  });
});
