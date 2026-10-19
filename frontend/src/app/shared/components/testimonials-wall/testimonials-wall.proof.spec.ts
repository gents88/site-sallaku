import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { TestimonialsWallComponent } from './testimonials-wall.component';

const LINK = 'https://www.linkedin.com/in/mario-rossi';
const base = { rating: 5, content: 'Ottimo lavoro, davvero consigliato.', featured: true, createdAt: '2026-10-01T00:00:00Z' };

describe('TestimonialsWallComponent — verifica', () => {
  it('badge e link LinkedIn solo sulle testimonianze verificate', () => {
    TestBed.configureTestingModule({
      imports: [TestimonialsWallComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TestimonialsWallComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('/testimonials/featured')).flush([
      { id: '1', authorName: 'Mario Verificato', ...base, verified: true, linkedinUrl: LINK },
      { id: '2', authorName: 'Anna Non Verificata', ...base, verified: false },
    ]);
    fixture.detectChanges();

    const cards = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.wall-card'));
    const verified = cards.find(c => c.textContent?.includes('Mario Verificato'))!;
    const plain = cards.find(c => c.textContent?.includes('Anna Non Verificata'))!;
    expect(verified.querySelector('.tp__badge')).not.toBeNull();
    expect(verified.querySelector('a.tp__link')?.getAttribute('href')).toBe(LINK);
    expect(plain.querySelector('.tp__badge, .tp__link')).toBeNull();
  });
});
