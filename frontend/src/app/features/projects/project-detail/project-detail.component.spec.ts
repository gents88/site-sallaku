import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectsService } from '../../../core/services/projects.service';
import { LanguageService } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';
import { Project } from '../../../core/models/project.model';

const project = {
  _id: '1', slug: 'cms', title: 'Gestionale', description: 'Descrizione', problem: 'Il problema',
  solution: '', results: 'Risultati', technologies: ['Angular'], images: [], featured: true, order: 0,
  liveUrl: 'https://example.com', createdAt: '', updatedAt: '',
  translations: { en: { title: 'Management app', problem: 'The problem' } },
} as Project;

async function setup(getBySlug: ProjectsService['getBySlug'], lang: 'it' | 'en' = 'it') {
  const seo = { update: vi.fn(), injectJsonLd: vi.fn(), breadcrumb: vi.fn(() => ({})) };
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: ProjectsService, useValue: { getBySlug: vi.fn(getBySlug) } },
      { provide: LanguageService, useValue: { current: signal(lang) } },
      { provide: SeoService, useValue: seo },
    ],
  });
  const fixture = TestBed.createComponent(ProjectDetailComponent);
  fixture.componentRef.setInput('slug', 'cms');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, seo, component: fixture.componentInstance };
}

describe('ProjectDetailComponent', () => {
  it('renders the case study, skipping empty sections', async () => {
    const { el, seo } = await setup(() => of(project));
    expect(el.querySelector('h1')?.textContent).toContain('Gestionale');
    const headings = Array.from(el.querySelectorAll('.pd__section h2')).map(h => h.textContent?.trim());
    expect(headings).toEqual(['project_detail.problem', 'project_detail.results']);
    expect(el.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(seo.update).toHaveBeenCalledWith(expect.objectContaining({ title: 'Gestionale' }));
  });

  it('shows the translated case study in English with Italian fallback', async () => {
    const { el } = await setup(() => of(project), 'en');
    expect(el.querySelector('h1')?.textContent).toContain('Management app');
    expect(el.textContent).toContain('The problem');
    expect(el.textContent).toContain('Risultati');
  });

  it('shows a not-found state on 404', async () => {
    const { el } = await setup(() => throwError(() => ({ status: 404 })));
    expect(el.textContent).toContain('project_detail.not_found');
  });

  it('shows a retryable error on other failures', async () => {
    const { el } = await setup(() => throwError(() => ({ status: 500 })));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('project_detail.load_error');
  });
});
