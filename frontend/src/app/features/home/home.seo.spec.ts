import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { SeoService } from '../../core/services/seo.service';
import { TestimonialsService } from '../../core/services/testimonials.service';

function render() {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})), setNoIndex: vi.fn() };
  TestBed.configureTestingModule({
    imports: [HomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: SeoService, useValue: seo },
      { provide: TestimonialsService, useValue: { hasPublic: () => signal(false), getFeatured: () => ({ subscribe: () => {} }) } },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return { seo, el: fixture.nativeElement as HTMLElement };
}

describe('Home: SEO e dati strutturati', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('invia a Google un FAQPage con le stesse domande che la pagina mostra', () => {
    const { seo, el } = render();
    type Schema = { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] };
    // La chiamata della home è quella che contiene la Person (altri componenti possono inviare i propri schemi).
    const call = seo.injectJsonLd.mock.calls.map(c => c[0] as Schema | Schema[]).find(a => Array.isArray(a) && a.some(x => x?.['@type'] === 'Person'));
    expect(call, 'nessuna chiamata con la Person').toBeTruthy();
    const schemas = call as Schema[];
    const faq = schemas.find(s => s['@type'] === 'FAQPage');
    expect(faq, 'manca FAQPage').toBeTruthy();
    expect(faq!.mainEntity!.length).toBe(el.querySelectorAll('#faq details').length);
    expect(faq!.mainEntity!.length).toBeGreaterThanOrEqual(6);
    // Person e WebSite restano: injectJsonLd sostituisce tutto, quindi vanno nella stessa chiamata
    expect(schemas.map(s => s['@type'])).toEqual(expect.arrayContaining(['Person', 'WebSite', 'FAQPage']));
  });

  it("l'H1 contiene il nome e il ruolo (la parte del ruolo è per motori di ricerca e screen reader)", () => {
    const { el } = render();
    const h1 = el.querySelector('h1.hero-name')!;
    expect(h1.textContent).toContain('Gent');
    expect(h1.textContent).toContain('Sallaku');
    expect(h1.querySelector('.hero-name__sr')?.textContent).toContain('home_v2.h1_suffix');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
  });

  it('imposta title e description della home dai testi tradotti', () => {
    const { seo } = render();
    expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'page_meta.home_title', description: 'page_meta.home_description' }));
  });
});
