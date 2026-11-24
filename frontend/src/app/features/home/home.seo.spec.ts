import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NAV_REGISTRY } from '../../core/navigation/nav-registry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { SeoService } from '../../core/services/seo.service';
import { TestimonialsService } from '../../core/services/testimonials.service';
import { BlogService } from '../../core/services/blog.service';
import { of } from 'rxjs';

function render(posts: unknown[] = []) {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})), setNoIndex: vi.fn() };
  TestBed.configureTestingModule({
    imports: [HomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: SeoService, useValue: seo },
      { provide: BlogService, useValue: { getPublished: () => of({ data: posts, total: posts.length, page: 1, pages: 1 }) } },
      { provide: TestimonialsService, useValue: { hasPublic: () => signal(false), getFeatured: () => ({ subscribe: () => {} }) } },
    ],
  });
  // Traduzioni vere per i nomi del Lab: senza, i nomi sono chiavi grezze e il componente li scarta (giustamente).
  const labels: Record<string, unknown> = {};
  for (const e of NAV_REGISTRY.filter(x => x.route.startsWith('/lab/'))) {
    const key = e.searchTitleKey ?? e.labelKey;
    const parts = key.split('.');
    let o = labels;
    parts.slice(0, -1).forEach(k => { o = (o[k] ??= {}) as Record<string, unknown>; });
    o[parts[parts.length - 1]] = `Strumento ${e.id}`;
  }
  TestBed.inject(TranslateService).setTranslation('en', labels as never);
  TestBed.inject(TranslateService).use('en');
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

  // Le parole chiave "dietro le quinte" vanno nei dati strutturati (legittimi), mai in testo nascosto nella pagina.
  it('mette nei dati strutturati le tecnologie e i tag degli articoli, senza aggiungerli alla pagina', () => {
    const posts = [
      { _id: '1', slug: 'a', title: 'A', excerpt: '', tags: ['Blinisht', 'storia'], publishedAt: '2026-11-01' },
      { _id: '2', slug: 'b', title: 'B', excerpt: '', tags: ['blinisht', 'Zadrima'], publishedAt: '2026-11-02' },
    ];
    const { seo, el } = render(posts);
    type Node = { '@type': string; knowsAbout?: string[]; keywords?: string };
    const calls = seo.injectJsonLd.mock.calls.map(c => c[0] as Node[]).filter(a => Array.isArray(a) && a.some(x => x?.['@type'] === 'Person'));
    const last = calls[calls.length - 1];
    const person = last.find(n => n['@type'] === 'Person')!;
    const site = last.find(n => n['@type'] === 'WebSite')!;
    expect(person.knowsAbout).toEqual(expect.arrayContaining(['Angular', 'Cesium.js', 'Blinisht', 'storia', 'Zadrima']));
    expect(person.knowsAbout!.filter(t => t.toLowerCase() === 'blinisht')).toHaveLength(1); // niente doppioni
    expect(site.keywords).toContain('Angular');
    // la pagina non mostra i tag degli articoli: sono solo dati per i motori di ricerca
    expect(el.querySelector('.hero-tags')).toBeNull();
    expect(el.textContent).not.toContain('Zadrima');
    expect(el.querySelectorAll('[hidden], .visually-hidden, .sr-only')).toHaveLength(0);
  });

  it('descrive Lab e articoli in due elenchi strutturati (ItemList), senza mostrarli nella pagina', () => {
    const posts = [
      { _id: '1', slug: 'unire-pdf', title: 'Unire PDF', excerpt: 'Come unire più PDF senza caricarli.', tags: ['pdf'], publishedAt: '2026-11-01' },
      { _id: '2', slug: 'ocr-online', title: 'OCR online', excerpt: 'Estrarre testo da una scansione.', tags: ['ocr'], publishedAt: '2026-11-02' },
      { _id: '3', slug: 'terzo', title: 'Terzo', excerpt: 'Terzo estratto.', tags: [], publishedAt: '2026-11-03' },
      // dal quarto in poi la home non li mostra (solo i primi 3 sono "Ultimi articoli"): stanno solo nei dati strutturati
      { _id: '4', slug: 'quarto', title: 'Quarto', excerpt: 'Estratto nascosto del quarto.', tags: [], publishedAt: '2026-11-04' },
      { _id: '5', slug: 'quinto', title: 'Quinto', excerpt: 'Estratto nascosto del quinto.', tags: [], publishedAt: '2026-11-05' },
    ];
    const { seo, el } = render(posts);
    type Item = { name: string; url: string; description?: string };
    type Node = { '@type': string; name?: string; itemListElement?: Item[]; knowsAbout?: string[] };
    const calls = seo.injectJsonLd.mock.calls.map(c => c[0] as Node[]).filter(a => Array.isArray(a) && a.some(x => x?.['@type'] === 'Person'));
    const last = calls[calls.length - 1];
    const lists = last.filter(n => n['@type'] === 'ItemList');
    expect(lists).toHaveLength(2);
    const lab = lists[0].itemListElement!;
    expect(lab.length).toBeGreaterThanOrEqual(10);
    expect(lab.every(i => i.url.startsWith('https://gentsallaku.it/') && i.url.includes('/lab/'))).toBe(true);
    const articles = lists[1].itemListElement!;
    expect(articles.map(a => a.name)).toEqual(['Unire PDF', 'OCR online', 'Terzo', 'Quarto', 'Quinto']);
    expect(articles[4].description).toContain('nascosto del quinto');
    expect(articles[0].description).toContain('senza caricarli');
    expect(articles[0].url).toContain('/blog/unire-pdf');
    // i nomi degli strumenti stanno anche tra gli argomenti della persona (anche quelli che la home non mostra)
    const person = last.find(n => n['@type'] === 'Person')!;
    expect(person.knowsAbout).toContain('Strumento wifi-qr-code');
    // niente di tutto questo compare nella pagina
    expect(el.textContent).not.toContain('Strumento wifi-qr-code');
    expect(el.textContent).not.toContain('Estratto nascosto del quinto');
    expect(el.textContent).not.toContain('Estratto nascosto del quarto');
  });
});
