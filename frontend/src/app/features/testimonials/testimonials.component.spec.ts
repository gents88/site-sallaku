import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestimonialsComponent } from './testimonials.component';
import { SeoService } from '../../core/services/seo.service';

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

describe('TestimonialsComponent — verifica e LinkedIn', () => {
  const LINK = 'https://www.linkedin.com/in/mario-rossi';
  const base = { rating: 5, content: 'Ottimo lavoro, davvero consigliato.', featured: false, createdAt: '2026-10-01T00:00:00Z' };
  const list = [
    { id: '1', authorName: 'Mario Verificato', ...base, verified: true, linkedinUrl: LINK },
    { id: '2', authorName: 'Anna Non Verificata', ...base, verified: false },
    { id: '3', authorName: 'Vecchia Senza Campi', ...base },
  ];

  let http: HttpTestingController;

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [TestimonialsComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => vi.unstubAllGlobals());

  function renderWithList() {
    const jsonLd = vi.spyOn(TestBed.inject(SeoService), 'injectJsonLd');
    const fixture = TestBed.createComponent(TestimonialsComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('/testimonials')).flush({ data: list, total: list.length });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, jsonLd };
  }

  it('solo la testimonianza verificata mostra badge e link LinkedIn', () => {
    const { el } = renderWithList();
    const cards = Array.from(el.querySelectorAll('.testimonial-card'));
    const byName = (n: string) => cards.find(c => c.textContent?.includes(n))!;

    expect(byName('Mario Verificato').querySelector('.tp__badge')).not.toBeNull();
    expect(byName('Mario Verificato').querySelector('a.tp__link')?.getAttribute('href')).toBe(LINK);
    expect(byName('Anna Non Verificata').querySelector('.tp__badge, .tp__link')).toBeNull();
    expect(byName('Vecchia Senza Campi').querySelector('.tp__badge, .tp__link')).toBeNull();
  });

  it('nei dati strutturati il profilo LinkedIn (sameAs) c\'è solo per l\'autore verificato', () => {
    const { jsonLd } = renderWithList();
    const nodes = jsonLd.mock.calls[0][0] as Array<Record<string, any>>;
    const reviews = nodes.filter(n => n['@type'] === 'Review');

    expect(reviews.find(r => r['author'].name === 'Mario Verificato')!['author'].sameAs).toBe(LINK);
    expect(reviews.find(r => r['author'].name === 'Anna Non Verificata')!['author']).not.toHaveProperty('sameAs');
    expect(reviews.find(r => r['author'].name === 'Vecchia Senza Campi')!['author']).not.toHaveProperty('sameAs');
  });

  describe('campo LinkedIn del form', () => {
    function fill(cmp: TestimonialsComponent, linkedin: string) {
      cmp.form.patchValue({ authorName: 'Mario Rossi', rating: 5, content: 'Ottimo lavoro, davvero consigliato.', linkedinUrl: linkedin });
    }

    it('è facoltativo: lasciato vuoto il form resta valido e non invia il campo', () => {
      const fixture = TestBed.createComponent(TestimonialsComponent);
      fixture.detectChanges();
      http.expectOne(r => r.url.includes('/testimonials')).flush({ data: [], total: 0 });
      fill(fixture.componentInstance, '');

      fixture.componentInstance.submit();

      const post = http.expectOne(r => r.method === 'POST');
      expect(post.request.body.linkedinUrl).toBeUndefined();
    });

    it('manda il link normalizzato (https://www.linkedin.com/in/…)', () => {
      const fixture = TestBed.createComponent(TestimonialsComponent);
      fixture.detectChanges();
      http.expectOne(r => r.url.includes('/testimonials')).flush({ data: [], total: 0 });
      fill(fixture.componentInstance, 'linkedin.com/in/mario-rossi/?trk=x');

      fixture.componentInstance.submit();

      expect(http.expectOne(r => r.method === 'POST').request.body.linkedinUrl).toBe(LINK);
    });

    it('un link che non è un profilo LinkedIn blocca l\'invio e mostra l\'errore collegato al campo', () => {
      const fixture = TestBed.createComponent(TestimonialsComponent);
      fixture.detectChanges();
      http.expectOne(r => r.url.includes('/testimonials')).flush({ data: [], total: 0 });
      fill(fixture.componentInstance, 'https://evil.example/in/mario-rossi');

      fixture.componentInstance.submit();
      fixture.detectChanges();

      http.expectNone(r => r.method === 'POST');
      const input = (fixture.nativeElement as HTMLElement).querySelector('#testimonial-linkedin')!;
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toContain('testimonial-linkedin-err');
      expect((fixture.nativeElement as HTMLElement).querySelector('#testimonial-linkedin-err')?.getAttribute('role')).toBe('alert');
    });

    it('spiega che il link compare solo se l\'admin verifica la testimonianza', () => {
      const fixture = TestBed.createComponent(TestimonialsComponent);
      fixture.detectChanges();
      http.expectOne(r => r.url.includes('/testimonials')).flush({ data: [], total: 0 });
      const hint = (fixture.nativeElement as HTMLElement).querySelector('#testimonial-linkedin-hint');
      expect(hint).not.toBeNull();
    });
  });
});
