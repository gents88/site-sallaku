const test = require('node:test');
const assert = require('node:assert/strict');
const { staticRoutes, withLangVariants, withoutEmptyPages } = require('./generate-sitemap.js');

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

test('la home delle altre lingue è /en, /de… (come il canonical), non /xx/homepage', () => {
  const locs = withLangVariants([{ loc: '/', changefreq: 'weekly', priority: '1.0' }]).map((e) => e.loc);
  assert.deepEqual(locs, ['/en', '/sq', '/es', '/pt', '/fr', '/de']);
});

test('le altre pagine restano /<lingua>/<pagina>', () => {
  const locs = withLangVariants([{ loc: '/contact', changefreq: 'monthly', priority: '0.8' }]).map((e) => e.loc);
  assert.ok(locs.includes('/en/contact'));
});
