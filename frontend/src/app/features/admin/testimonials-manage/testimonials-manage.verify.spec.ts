import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestimonialsManageComponent } from './testimonials-manage.component';
import { AdminTestimonial } from '../../../core/models/testimonial-admin.model';

const LINK = 'https://www.linkedin.com/in/mario-rossi';
const item = (over: Partial<AdminTestimonial>): AdminTestimonial => ({
  id: 'x', authorName: 'Mario Rossi', rating: 5, content: 'Ottimo lavoro, davvero.', isApproved: false, isSpam: false,
  spamScore: 0, featured: false, verified: false, createdAt: '2026-10-01T00:00:00Z', ...over,
});

describe('TestimonialsManageComponent — verifica identità', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestimonialsManageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render(items: AdminTestimonial[]) {
    const fixture = TestBed.createComponent(TestimonialsManageComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url.includes('/testimonials/admin/list')).flush({ data: items, total: items.length });
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("mostra all'admin il link LinkedIn indicato dall'autore, per controllarlo prima di verificare", () => {
    const { el } = render([item({ linkedinUrl: LINK })]);
    const a = el.querySelector('.testimonial-row__linkedin') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe(LINK);
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(el.querySelector('.badge--verified')).toBeNull();
  });

  it('un link che non è un profilo LinkedIn non diventa mai un href cliccabile', () => {
    const { el } = render([item({ linkedinUrl: 'javascript:alert(1)' })]);
    expect(el.querySelector('.testimonial-row__linkedin')).toBeNull();
  });

  it('una testimonianza verificata mostra il badge', () => {
    const { el } = render([item({ verified: true })]);
    expect(el.querySelector('.badge--verified')).not.toBeNull();
  });

  it('"Verifica identità" chiama PATCH …/verify con verified:true; su una già verificata manda false', () => {
    const { fixture, el } = render([item({ id: 'a' }), item({ id: 'b', verified: true })]);
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.verify-btn'));
    expect(buttons.length).toBe(2);

    buttons[0].click();
    const first = http.expectOne(r => r.method === 'PATCH' && r.url.endsWith('/a/verify'));
    expect(first.request.body).toEqual({ verified: true });
    first.flush(item({ id: 'a', verified: true }));
    http.expectOne(r => r.url.includes('/testimonials/admin/list')).flush({ data: [], total: 0 });

    fixture.componentInstance.toggleVerified(item({ id: 'b', verified: true }));
    const second = http.expectOne(r => r.method === 'PATCH' && r.url.endsWith('/b/verify'));
    expect(second.request.body).toEqual({ verified: false });
    second.flush(item({ id: 'b' }));
    http.expectOne(r => r.url.includes('/testimonials/admin/list')).flush({ data: [], total: 0 });
  });

  it('le testimonianze spam non offrono la verifica', () => {
    const { el } = render([item({ isSpam: true })]);
    expect(el.querySelector('.verify-btn')).toBeNull();
  });
});
