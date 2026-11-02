import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NON_DEFAULT_LANGS } from '../../core/services/language.service';
import { PRE_SCROLLED_ATTR, SECTION_ROUTES, consumePreScroll, jumpToSection, sectionForUrl } from './jump-to-section';

/** Lo script inline in fondo a src/index.html che posiziona /about & co. prima del primo paint. */
function inlinePreScrollScript(): string {
  const html = readFileSync(join(__dirname, '..', '..', '..', 'index.html'), 'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('scrollIntoView'));
  expect(script, 'index.html deve avere lo script che posiziona le sezioni').toBeDefined();
  return script!;
}

describe('sectionForUrl', () => {
  it('riconosce le rotte delle sezioni, anche con prefisso lingua, query o slash finale', () => {
    expect(sectionForUrl('/about')).toBe('about');
    expect(sectionForUrl('/en/about')).toBe('about');
    expect(sectionForUrl('/de/skills/')).toBe('skills');
    expect(sectionForUrl('/tech-stack?utm_source=x')).toBe('tech-stack');
    expect(sectionForUrl('/services#faq')).toBe('services');
  });

  it('null per le altre rotte, home compresa', () => {
    expect(sectionForUrl('/')).toBeNull();
    expect(sectionForUrl('/homepage')).toBeNull();
    expect(sectionForUrl('/blog')).toBeNull();
    expect(sectionForUrl('/en/blog/about')).toBeNull();
    expect(sectionForUrl('/xx/about')).toBeNull();
  });
});

describe('consumePreScroll', () => {
  afterEach(() => document.documentElement.removeAttribute(PRE_SCROLLED_ATTR));

  it('true una sola volta se lo script inline ha già posizionato questa sezione', () => {
    document.documentElement.setAttribute(PRE_SCROLLED_ATTR, 'about');
    expect(consumePreScroll(document, 'about')).toBe(true);
    expect(consumePreScroll(document, 'about')).toBe(false);
  });

  it('false senza segnale o per un\'altra sezione, e il segnale non sopravvive', () => {
    expect(consumePreScroll(document, 'about')).toBe(false);
    document.documentElement.setAttribute(PRE_SCROLLED_ATTR, 'skills');
    expect(consumePreScroll(document, 'about')).toBe(false);
    expect(document.documentElement.hasAttribute(PRE_SCROLLED_ATTR)).toBe(false);
  });
});

describe('script inline di index.html', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(PRE_SCROLLED_ATTR);
    history.replaceState(null, '', '/');
  });

  it('usa le stesse lingue e le stesse sezioni del codice Angular', () => {
    const pattern = /\(\?:\(\?:([a-z|]+)\)\\\/\)\?\(([a-z|-]+)\)/.exec(inlinePreScrollScript());
    expect(pattern, 'regex delle rotte non trovata nello script').not.toBeNull();
    expect(pattern![1].split('|').sort()).toEqual([...NON_DEFAULT_LANGS].sort());
    expect(pattern![2].split('|').sort()).toEqual([...SECTION_ROUTES].sort());
  });

  function page(path: string) {
    history.replaceState(null, '', path);
    document.body.innerHTML = `
      <section id="homepage"><p class="reveal" id="hero-r"></p></section>
      <section id="about"><p class="reveal" id="seen"></p><p class="reveal" id="below"></p></section>`;
    const about = document.getElementById('about')!;
    about.scrollIntoView = vi.fn();
    const rect = (top: number) => () => ({ top, bottom: top + 100 }) as DOMRect;
    document.getElementById('hero-r')!.getBoundingClientRect = rect(-900);
    document.getElementById('seen')!.getBoundingClientRect = rect(200);
    document.getElementById('below')!.getBoundingClientRect = rect(innerHeight + 50);
    new Function(inlinePreScrollScript())();
    return about;
  }

  it('su /about porta in vista la sezione, mostra solo i .reveal visibili e lascia il segnale', () => {
    const about = page('/en/about');
    expect(about.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    expect(document.getElementById('seen')!.classList.contains('visible')).toBe(true);
    expect(document.getElementById('below')!.classList.contains('visible')).toBe(false);
    expect(document.getElementById('hero-r')!.classList.contains('visible')).toBe(false);
    expect(document.documentElement.getAttribute(PRE_SCROLLED_ATTR)).toBe('about');
  });

  it('sulle altre pagine non fa nulla', () => {
    const about = page('/blog');
    expect(about.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.visible')).toHaveLength(0);
    expect(document.documentElement.hasAttribute(PRE_SCROLLED_ATTR)).toBe(false);
  });
});

describe('jumpToSection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('porta la sezione in vista in modo istantaneo, non animato', () => {
    document.body.innerHTML = '<section id="about"></section>';
    const target = document.getElementById('about')!;
    target.scrollIntoView = vi.fn();

    jumpToSection(document, 'about');

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('non fa nulla se la sezione non esiste', () => {
    expect(() => jumpToSection(document, 'inesistente')).not.toThrow();
  });
});
