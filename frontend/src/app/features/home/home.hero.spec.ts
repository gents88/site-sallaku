import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { TestimonialsService } from '../../core/services/testimonials.service';

function render(hasTestimonials: boolean): HTMLElement {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  TestBed.configureTestingModule({
    imports: [HomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: TestimonialsService,
        useValue: { hasPublic: () => signal(hasTestimonials), getFeatured: () => ({ subscribe: () => {} }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Home: niente numeri non dimostrabili né dati personali superflui', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('l\'hero non mostra più i contatori (anni, progetti, aziende, latenza)', () => {
    const el = render(false);
    expect(el.querySelector('.hero-kpis')).toBeNull();
    expect(el.querySelectorAll('.kpi-number')).toHaveLength(0);
  });

  it('i livelli 3D dell\'hero (carta da progetto, alone, schema a livelli) sono decorativi e nascosti agli screen reader', () => {
    const el = render(false);
    for (const sel of ['.hero-bg-grid', '.hero-glow', '.hero-arch']) {
      const layer = el.querySelector(`#homepage > ${sel}`);
      expect(layer, sel).not.toBeNull();
      expect(layer?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('si muovono solo testo, schema e alone: niente di marcato sull\'hero intero', () => {
    const el = render(false);
    const hero = el.querySelector('#homepage') as HTMLElement;
    expect(hero.hasAttribute('data-hero-tilt')).toBe(false);
    const tilted = Array.from(hero.querySelectorAll<HTMLElement>('[data-hero-tilt]')).map(t => [t.className, t.dataset['heroTilt']]);
    expect(tilted).toEqual([['hero-arch__tilt', '1.5'], ['hero-content', '0.5']]);
    expect(hero.querySelectorAll('[data-hero-glow]')).toHaveLength(1);
    expect(hero.querySelector('[data-hero-glow]')?.classList.contains('hero-glow')).toBe(true);
  });

  it('lo schema architetturale ha i quattro livelli, dall\'alto (client) al basso (data)', () => {
    const labels = Array.from(render(false).querySelectorAll('.hero-arch__layer .hero-arch__label')).map(l => l.textContent?.trim());
    expect(labels).toEqual(['client', 'api', 'services', 'data']);
  });

  it('ogni collegamento verticale dello schema scende su un nodo nella stessa posizione del livello sotto', () => {
    const layers = Array.from(render(false).querySelectorAll('.hero-arch__layer'));
    const position = (node: Element) => Array.from(node.classList).find(c => /^hero-arch__node--[abc]$/.test(c));
    layers.forEach((layer, i) => {
      layer.querySelectorAll('.hero-arch__link').forEach((link: Element) => {
        const pos = position(link.parentElement as Element);
        const below = layers[i + 1];
        expect(below, `link da ${pos} sull'ultimo livello`).toBeDefined();
        expect(below.querySelector(`.${pos}`), `${pos} manca sotto il livello ${i}`).not.toBeNull();
      });
    });
  });

  it('la sezione Chi sono non mostra la data di nascita', () => {
    const el = render(false);
    expect(el.querySelector('.about-birth')).toBeNull();
    expect(el.textContent).not.toContain('about.birth');
  });

  it('senza testimonianze pubblicate la sezione non c\'è', () => {
    expect(render(false).querySelector('#testimonials')).toBeNull();
  });

  it('con almeno una testimonianza la sezione c\'è', () => {
    expect(render(true).querySelector('#testimonials')).not.toBeNull();
  });
});

describe("Home: nessuna etichetta di parole chiave nell'interfaccia", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Le parole chiave stanno solo nei dati strutturati (home.seo.spec): la pagina non mostra elenchi di etichette.
  it('l\'hero non ha etichette di parole chiave', () => {
    const el = render(false);
    expect(el.querySelector('.hero-tags')).toBeNull();
    expect(el.querySelector('.hero-tag')).toBeNull();
    expect(el.querySelector('.hero-tags-more')).toBeNull();
  });
});
