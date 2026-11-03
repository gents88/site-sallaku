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
