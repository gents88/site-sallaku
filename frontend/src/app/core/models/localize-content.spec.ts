import { describe, expect, it } from 'vitest';
import { hasCaseStudy, localizeExperience, localizeProject } from './localize-content';
import { Project } from './project.model';
import { Experience } from './experience.model';

const project = {
  _id: '1', slug: 'cms', title: 'Gestionale', description: 'Descrizione italiana', problem: 'Problema',
  technologies: [], images: [], featured: false, order: 0, createdAt: '', updatedAt: '',
  translations: { en: { title: 'Management app', description: '   ' } },
} as Project;

describe('localizeProject', () => {
  it('returns the Italian original for it', () => {
    expect(localizeProject(project, 'it')).toBe(project);
  });

  it('uses translated fields and falls back to Italian for missing or blank ones', () => {
    const en = localizeProject(project, 'en');
    expect(en.title).toBe('Management app');
    expect(en.description).toBe('Descrizione italiana'); // tradotto vuoto → italiano
    expect(en.problem).toBe('Problema');                  // non tradotto → italiano
    expect(project.title).toBe('Gestionale');             // l'originale non viene mutato
  });

  it('falls back entirely when the language has no translations', () => {
    expect(localizeProject(project, 'de').title).toBe('Gestionale');
  });
});

describe('localizeExperience', () => {
  it('translates role/description/location only', () => {
    const exp = { _id: 'e', company: 'Acme', role: 'Sviluppatore', description: 'x', current: true, startDate: '2020', technologies: [], order: 0, createdAt: '', updatedAt: '',
      translations: { fr: { role: 'Développeur' } } } as Experience;
    expect(localizeExperience(exp, 'fr')).toMatchObject({ role: 'Développeur', company: 'Acme' });
  });
});

describe('hasCaseStudy', () => {
  it('requires a slug and at least one non-empty case study section', () => {
    expect(hasCaseStudy(project)).toBe(true);
    expect(hasCaseStudy({ ...project, problem: '  ', solution: '', results: undefined })).toBe(false);
    expect(hasCaseStudy({ ...project, slug: '' })).toBe(false);
  });
});
