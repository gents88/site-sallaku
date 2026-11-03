const test = require('node:test');
const assert = require('node:assert/strict');
const { staticRoutes, withoutEmptyPages } = require('./generate-sitemap.js');

test('senza testimonianze pubblicate /testimonials resta fuori dalla sitemap', () => {
  const locs = withoutEmptyPages(staticRoutes(), { hasTestimonials: false }).map((e) => e.loc);
  assert.ok(!locs.includes('/testimonials'));
  assert.ok(locs.includes('/blog'));
});

test('con almeno una testimonianza /testimonials torna in sitemap', () => {
  const locs = withoutEmptyPages(staticRoutes(), { hasTestimonials: true }).map((e) => e.loc);
  assert.ok(locs.includes('/testimonials'));
});

test('la pagina dei Termini è in sitemap', () => {
  assert.ok(staticRoutes().some((e) => e.loc === '/terms'));
});
