import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOME_PROJECTS_LIMIT, HomeComponent, KPI_TARGETS } from './home.component';
import { ProjectsService } from '../../core/services/projects.service';
import { TestimonialsService } from '../../core/services/testimonials.service';
import { LanguageService } from '../../core/services/language.service';
import { SeoService } from '../../core/services/seo.service';
import { AnalyticsTrackingService } from '../../core/services/analytics-tracking.service';
import { Testimonial } from '../../core/models/testimonial.model';

const testimonial: Testimonial = {
  id: 't1', authorName: 'Mario Rossi', rating: 5, content: 'Ottimo lavoro', featured: true, createdAt: '',
};

function setup(opts: { platform?: 'browser' | 'server'; testimonials?: Testimonial[] } = {}) {
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: PLATFORM_ID, useValue: opts.platform ?? 'server' },
      { provide: ProjectsService, useValue: { getAll: () => of([]) } },
      { provide: TestimonialsService, useValue: { getFeatured: () => of(opts.testimonials ?? []), list: () => of({ data: [], total: 0 }) } },
      { provide: LanguageService, useValue: { current: signal('it') } },
      { provide: SeoService, useValue: { update: vi.fn(), injectJsonLd: vi.fn() } },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const kpiNumbers = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('.kpi-number')).map(n => Number.parseInt(n.textContent ?? '', 10));

describe('HomeComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('mette i numeri reali nell\'HTML prerenderizzato (regressione: "0+ anni di esperienza")', () => {
    const { el } = setup({ platform: 'server' });
    expect(kpiNumbers(el)).toEqual([...KPI_TARGETS]);
  });

  describe('conteggio animato nel browser', () => {
    let ioCallback: IntersectionObserverCallback;
    const disconnect = vi.fn();

    function stubBrowser() {
      disconnect.mockClear();
      vi.stubGlobal('IntersectionObserver', class {
        constructor(cb: IntersectionObserverCallback) { ioCallback = cb; }
        observe() {}
        unobserve() {}
        disconnect = disconnect;
      });
      vi.stubGlobal('matchMedia', () => ({ matches: false }));
      // Un solo frame "a fine animazione".
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(performance.now() + 10_000); return 0; });
    }
    const fire = (isIntersecting: boolean, intersectionRatio: number) =>
      ioCallback([{ isIntersecting, intersectionRatio } as IntersectionObserverEntry], {} as IntersectionObserver);

    it('se la striscia è già a schermo non la azzera (niente numeri che spariscono)', () => {
      stubBrowser();
      const { fixture, el } = setup({ platform: 'browser' });
      fire(true, 1);
      fixture.detectChanges();
      expect(kpiNumbers(el)).toEqual([...KPI_TARGETS]);
      expect(disconnect).toHaveBeenCalled();
    });

    it('se è fuori schermo parte da 0 e conta fino ai valori reali quando arriva a metà', () => {
      stubBrowser();
      const { fixture, el } = setup({ platform: 'browser' });
      fire(false, 0);
      fixture.detectChanges();
      expect(kpiNumbers(el)).toEqual([0, 0, 0, 0]);

      fire(true, 0.6);
      fixture.detectChanges();
      expect(kpiNumbers(el)).toEqual([...KPI_TARGETS]);
    });
  });

  it('mostra un\'anteprima dei progetti e il link all\'elenco completo', () => {
    const { el } = setup();
    expect(el.querySelectorAll('#projects .project-card')).toHaveLength(HOME_PROJECTS_LIMIT);
    expect(el.querySelector('#projects .section-more a')?.getAttribute('href')).toBe('/projects');
  });

  it('ha i due inviti all\'azione nell\'hero: contatti e progetti', () => {
    const { el } = setup();
    const actions = Array.from(el.querySelectorAll<HTMLAnchorElement>('.hero-actions a'));
    expect(actions.map(a => a.getAttribute('href'))).toEqual(['/contact', '#projects']);
  });

  it('nasconde la sezione testimonianze finché non ce n\'è almeno una', () => {
    let { el } = setup({ testimonials: [] });
    expect(el.querySelector('#testimonials')?.classList).toContain('is-empty');

    TestBed.resetTestingModule();
    ({ el } = setup({ testimonials: [testimonial] }));
    expect(el.querySelector('#testimonials')?.classList).not.toContain('is-empty');
  });

  it('non contiene più le sezioni spostate su /about né il modulo di contatto', () => {
    const { el } = setup();
    for (const id of ['about', 'tech-stack', 'experience', 'skills', 'contact']) {
      expect(el.querySelector(`#${id}`)).toBeNull();
    }
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('.about-teaser a')?.getAttribute('href')).toBe('/about');
  });

  it('usa l\'indirizzo email vero nell\'invito finale (regressione: mailto verso email.com)', () => {
    const { el } = setup();
    const mail = Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]')).map(a => a.getAttribute('href'));
    expect(mail).toEqual(['mailto:gentsallaku@gmail.com']);
  });
});
