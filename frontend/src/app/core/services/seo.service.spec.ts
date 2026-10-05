import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  let routerStub: { url: string; events: unknown };

  function configure(): SeoService {
    routerStub = { url: '/', events: of() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerStub },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
    return TestBed.inject(SeoService);
  }

  afterEach(() => {
    document.querySelectorAll('meta[property^="og:locale"], link[rel="alternate"][hreflang], link[rel="canonical"]')
      .forEach(el => el.remove());
  });

  it('defaults og:locale to it_IT on the unprefixed (Italian) route', () => {
    const seo = configure();
    routerStub.url = '/blog';

    seo.update({ title: 'Blog' });

    const ogLocale = document.querySelector('meta[property="og:locale"]');
    expect(ogLocale?.getAttribute('content')).toBe('it_IT');
  });

  it('derives og:locale from the URL language prefix instead of always defaulting to Italian', () => {
    const seo = configure();
    routerStub.url = '/en/blog/some-post';

    seo.update({ title: 'Some Post' });

    const ogLocale = document.querySelector('meta[property="og:locale"]');
    expect(ogLocale?.getAttribute('content')).toBe('en_US');
  });

  it('emits one og:locale:alternate per other site language, excluding the current one', () => {
    const seo = configure();
    routerStub.url = '/de/projects';

    seo.update({ title: 'Projects' });

    const alternates = Array.from(document.querySelectorAll('meta[property="og:locale:alternate"]'))
      .map(el => el.getAttribute('content'));
    expect(alternates.sort()).toEqual(['en_US', 'es_ES', 'fr_FR', 'it_IT', 'pt_PT', 'sq_AL'].sort());
    expect(alternates).not.toContain('de_DE');
  });

  it('replaces og:locale:alternate tags on navigation instead of accumulating duplicates', () => {
    const seo = configure();
    routerStub.url = '/en/contact';
    seo.update({ title: 'Contact' });

    routerStub.url = '/fr/contact';
    seo.update({ title: 'Contact' });

    const alternates = Array.from(document.querySelectorAll('meta[property="og:locale:alternate"]'))
      .map(el => el.getAttribute('content'));
    // fr is now current, so its own locale drops out of the alternates list;
    // en_US (the previous page's language) stays, but only once — proving
    // the first update()'s tags were removed rather than left to accumulate.
    expect(alternates).not.toContain('fr_FR');
    expect(alternates.filter(c => c === 'en_US')).toHaveLength(1);
    expect(alternates.filter(c => c === 'it_IT')).toHaveLength(1);
  });

  it('an explicit locale override still wins over the URL-derived default', () => {
    const seo = configure();
    routerStub.url = '/en/contact';

    seo.update({ title: 'Contact', locale: 'sq_AL' });

    const ogLocale = document.querySelector('meta[property="og:locale"]');
    expect(ogLocale?.getAttribute('content')).toBe('sq_AL');
  });

  describe('translated paths (blog slugs)', () => {
    const alternatePaths = {
      it: '/blog/blinisht-storia', en: '/blog/blinisht-history', sq: '/blog/blinishti-historia',
      es: '/blog/blinisht-storia', pt: '/blog/blinisht-storia', fr: '/blog/blinisht-storia', de: '/blog/blinisht-storia',
    };
    const href = (lang: string) =>
      document.querySelector(`link[rel="alternate"][hreflang="${lang}"]`)?.getAttribute('href');

    it('points each hreflang at that language\'s own slug', () => {
      const seo = configure();
      routerStub.url = '/sq/blog/blinishti-historia';

      seo.update({ title: 'Blinishti', alternatePaths });

      expect(href('sq')).toBe('https://gentsallaku.it/sq/blog/blinishti-historia');
      expect(href('en')).toBe('https://gentsallaku.it/en/blog/blinisht-history');
      expect(href('de')).toBe('https://gentsallaku.it/de/blog/blinisht-storia');
      expect(href('it')).toBe('https://gentsallaku.it/blog/blinisht-storia');
      expect(href('x-default')).toBe('https://gentsallaku.it/blog/blinisht-storia');
    });

    it('exposes the translated path to the language switcher only while still on that page', () => {
      const seo = configure();
      routerStub.url = '/sq/blog/blinishti-historia';
      seo.update({ title: 'Blinishti', alternatePaths });

      expect(seo.alternatePath('en')).toBe('/blog/blinisht-history');

      routerStub.url = '/sq/blog';
      expect(seo.alternatePath('en')).toBeNull();
    });

    it('forgets the translated paths when the next page declares none', () => {
      const seo = configure();
      routerStub.url = '/sq/blog/blinishti-historia';
      seo.update({ title: 'Blinishti', alternatePaths });
      seo.update({ title: 'Same URL, no alternates' });

      expect(seo.alternatePath('en')).toBeNull();
      expect(href('en')).toBe('https://gentsallaku.it/en/blog/blinishti-historia');
    });
  });
});
