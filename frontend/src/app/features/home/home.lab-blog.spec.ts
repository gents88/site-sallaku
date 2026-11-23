import { ApplicationRef } from '@angular/core';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';
import { TestimonialsService } from '../../core/services/testimonials.service';
import { BlogService } from '../../core/services/blog.service';

function render(posts: unknown[]): HTMLElement {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  TestBed.configureTestingModule({
    imports: [HomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TestimonialsService, useValue: { hasPublic: () => signal(false), getFeatured: () => ({ subscribe: () => {} }) } },
      { provide: BlogService, useValue: { getPublished: () => of({ data: posts, total: posts.length, page: 1, pages: 1 }) } },
    ],
  });
  const fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Home: strumenti gratuiti, ultimi articoli, call to action', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mostra gli 8 strumenti in primo piano, ognuno con un link', () => {
    const el = render([]);
    const cards = el.querySelectorAll('#lab .lab-card');
    expect(cards).toHaveLength(8);
    cards.forEach(c => expect(c.getAttribute('href')).toContain('/lab/'));
  });

  it('l\'hero ha due pulsanti', () => {
    expect(render([]).querySelectorAll('.hero-actions a')).toHaveLength(2);
  });

  it('senza articoli la sezione "Ultimi articoli" non c\'è', () => {
    expect(render([]).querySelector('#latest-posts')).toBeNull();
  });

  it('con degli articoli ne mostra al massimo 3', () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({ _id: `${i}`, slug: `a-${i}`, title: `T${i}`, excerpt: 'x', tags: [] }));
    expect(render(posts).querySelectorAll('#latest-posts .latest-card')).toHaveLength(3);
  });
});

describe('Home: hero su telefono e ordine delle sezioni', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('la descrizione dell\'hero parte accorciata e il pulsante la apre', () => {
    const el = render([]);
    const desc = el.querySelector('#hero-description') as HTMLElement;
    const btn = el.querySelector('.hero-more') as HTMLButtonElement;
    expect(desc.classList.contains('is-collapsed')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    TestBed.inject(ApplicationRef).tick();
    expect(desc.classList.contains('is-collapsed')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('gli strumenti vengono subito dopo "Chi sono"', () => {
    const ids = Array.from(render([]).querySelectorAll('section[id]')).map(s => s.id);
    expect(ids.indexOf('lab')).toBe(ids.indexOf('about') + 1);
  });
});
