import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutComponent, TECH_GROUPS } from './about.component';
import { ExperiencesService } from '../../core/services/experiences.service';
import { LanguageService } from '../../core/services/language.service';
import { SeoService } from '../../core/services/seo.service';
import { AnalyticsTrackingService } from '../../core/services/analytics-tracking.service';
import { Experience } from '../../core/models/experience.model';

const experience = {
  _id: 'e1', company: 'Acme Space', role: 'Lead Front-End', startDate: '2022', current: true,
  description: 'Angular e Cesium', technologies: ['Angular'], order: 0, createdAt: '', updatedAt: '',
} as Experience;

async function setup(opts: { url?: string; platform?: 'browser' | 'server'; experiences?: Experience[] } = {}) {
  const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: PLATFORM_ID, useValue: opts.platform ?? 'server' },
      { provide: ExperiencesService, useValue: { getAll: () => of(opts.experiences ?? []) } },
      { provide: LanguageService, useValue: { current: signal('it') } },
      { provide: SeoService, useValue: seo },
      { provide: AnalyticsTrackingService, useValue: { trackClick: vi.fn() } },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(opts.url ?? '/about');
  const fixture = TestBed.createComponent(AboutComponent);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, seo };
}

describe('AboutComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('è una pagina con il suo h1 e un canonical su /about', async () => {
    const { el, seo } = await setup();
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(el.querySelector('h1')?.textContent).toContain('about.title');
    expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://gentsallaku.it/about' }));
  });

  it('contiene bio, tecnologie, esperienza e soft skills (prima stavano nella home)', async () => {
    const { el } = await setup();
    for (const id of ['about', 'tech-stack', 'experience', 'skills']) expect(el.querySelector(`#${id}`)).not.toBeNull();
    expect(el.querySelectorAll('.about-bio')).toHaveLength(5);
    expect(el.querySelectorAll('.skill-item')).toHaveLength(4);
  });

  it('elenca le tecnologie come chip, senza percentuali', async () => {
    const { el } = await setup();
    const chips = el.querySelectorAll('#tech-stack .tech-chip');
    expect(chips).toHaveLength(TECH_GROUPS.reduce((n, g) => n + g.items.length, 0));
    expect(el.querySelector('#tech-stack')?.textContent).not.toContain('%');
  });

  it('usa le esperienze del CMS quando ci sono, altrimenti la timeline statica', async () => {
    let { el } = await setup();
    expect(el.querySelectorAll('.timeline-item')).toHaveLength(5);

    TestBed.resetTestingModule();
    ({ el } = await setup({ experiences: [experience] }));
    expect(el.querySelectorAll('.timeline-item')).toHaveLength(1);
    expect(el.querySelector('.timeline-company')?.textContent).toContain('Acme Space');
  });

  it('i vecchi link /experience portano alla sezione giusta, con lo stesso canonical', async () => {
    // jsdom non ha scrollIntoView: lo si definisce e lo si ripristina (gli spec condividono i prototipi).
    const original = Element.prototype.scrollIntoView;
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
    try {
      const { seo } = await setup({ url: '/en/experience', platform: 'browser' });
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(scrolled).toEqual(['experience']);
      expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://gentsallaku.it/about' }));
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
