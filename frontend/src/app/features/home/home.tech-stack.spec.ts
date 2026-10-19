import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeComponent } from './home.component';

describe('Sezione competenze della home', () => {
  let section: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    TestBed.configureTestingModule({
      imports: [HomeComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    section = (fixture.nativeElement as HTMLElement).querySelector('#tech-stack') as HTMLElement;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('raggruppa le competenze in 4 aree, ciascuna un elenco semantico', () => {
    const lists = section.querySelectorAll('.tech-category ul.tech-items');
    expect(lists.length).toBe(4);
    lists.forEach(ul => expect(ul.querySelectorAll(':scope > li').length).toBeGreaterThan(0));
  });

  it('non mostra percentuali né barre di avanzamento (valori non verificabili)', () => {
    expect(section.querySelector('.tech-bar, .tech-bar-fill, .tech-tooltip')).toBeNull();
    expect(section.textContent).not.toMatch(/\d+\s*%/);
  });

  it('i nomi delle tecnologie sono testo reale nel DOM (visibili anche nell\'HTML prerenderizzato)', () => {
    const names = Array.from(section.querySelectorAll('.tech-name')).map(n => n.textContent?.trim());
    for (const expected of ['Angular', 'TypeScript', 'Cesium.js', 'NestJS / Node.js', 'Docker']) {
      expect(names).toContain(expected);
    }
  });

  it('le icone decorative sono nascoste agli screen reader', () => {
    section.querySelectorAll('.tech-item-icon').forEach(icon => expect(icon.getAttribute('aria-hidden')).toBe('true'));
  });
});
