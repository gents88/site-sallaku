/* eslint-disable @typescript-eslint/no-require-imports */
const { buildProjects, loadI18n, featuresText } = require('../../scripts/seed-projects-from-site.js');

describe('seed-projects-from-site', () => {
  const projects = buildProjects(loadI18n());

  it('builds the 5 projects shown on the site, in the same order, all featured', () => {
    expect(projects).toHaveLength(5);
    expect(projects.map((p: { order: number }) => p.order)).toEqual([0, 1, 2, 3, 4]);
    expect(projects.every((p: { featured: boolean }) => p.featured)).toBe(true);
  });

  it('uses only existing site texts: features become the "solution", problem/results stay empty', () => {
    for (const p of projects) {
      expect(p.solution).toMatch(/^• /);
      expect(p.problem).toBe('');
      expect(p.results).toBe('');
    }
  });

  it('carries the translations of all 6 non-Italian languages with unique slugs', () => {
    for (const p of projects) expect(Object.keys(p.translations).sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'sq']);
    expect(new Set(projects.map((p: { slug: string }) => p.slug)).size).toBe(5);
  });

  it('skips empty features', () => {
    expect(featuresText({ f1: 'A', f2: ' ', f3: undefined, f4: 'B' })).toBe('• A\n• B');
  });
});
