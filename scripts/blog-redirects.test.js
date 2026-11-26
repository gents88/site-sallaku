const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildRules, renderBlock, applyBlock, processBuild, NON_DEFAULT_LANGS, BEGIN, END } = require('./blog-redirects.js');

const POSTS = [
  { slug: 'unire-pdf', slug_en: 'merge-pdfs', slug_pt: 'juntar-pdf', slug_de: 'unire-pdf' /* uguale all'italiano */, slug_fr: '' },
  { slug: 'ocr.online', slug_en: 'online-ocr' },
];

test('una regola per ogni lingua il cui slug differisce da quello italiano', () => {
  const rules = buildRules(POSTS);
  assert.deepEqual(rules, [
    'RewriteRule ^en/blog/ocr\\.online/?$ /en/blog/online-ocr [R=301,L]',
    'RewriteRule ^en/blog/unire-pdf/?$ /en/blog/merge-pdfs [R=301,L]',
    'RewriteRule ^pt/blog/unire-pdf/?$ /pt/blog/juntar-pdf [R=301,L]',
  ]);
});

test('niente regola se lo slug della lingua è vuoto o uguale: quell\'indirizzo è già quello giusto', () => {
  const rules = buildRules([{ slug: 'a', slug_en: 'a', slug_pt: '', slug_de: undefined }]);
  assert.deepEqual(rules, []);
});

test('salta slug con caratteri che Apache non instrada o che potrebbero rompere la regola', () => {
  const rules = buildRules([{ slug: 'ok', slug_en: 'x y' }, { slug: 'bad slug', slug_en: 'z' }, { slug: 'ok2', slug_en: 'a$(b)' }]);
  assert.deepEqual(rules, []);
});

test('il punto nello slug è un punto letterale, non "qualsiasi carattere"', () => {
  assert.match(buildRules([{ slug: 'a.b', slug_en: 'c' }])[0], /\^en\/blog\/a\\\.b\//);
});

test('il blocco ha la guardia che salta le regole per tutto ciò che non è /<lingua>/blog/…, con il conteggio giusto', () => {
  const block = renderBlock(buildRules(POSTS));
  assert.match(block, /RewriteRule !\^\(\?:en\|sq\|es\|pt\|fr\|de\)\/blog\/ - \[S=3\]/);
  assert.equal(block.split('\n').filter((l) => l.includes('[R=301,L]')).length, 3);
});

test('senza regole il blocco resta vuoto (nessuna guardia)', () => {
  const block = renderBlock([]);
  assert.ok(!block.includes('RewriteRule'));
  assert.ok(block.includes(BEGIN) && block.includes(END));
});

test('sostituisce solo il contenuto fra i marcatori ed è idempotente', () => {
  const base = `RewriteEngine On\n  ${BEGIN}\n  ${END}\n  RewriteRule ^x$ /y [L]\n`;
  const once = applyBlock(base, buildRules(POSTS));
  assert.ok(once.includes('/en/blog/merge-pdfs'));
  assert.ok(once.startsWith('RewriteEngine On'));
  assert.ok(once.trimEnd().endsWith('RewriteRule ^x$ /y [L]'));
  assert.equal(applyBlock(once, buildRules(POSTS)), once);
  // con meno articoli le regole vecchie spariscono
  assert.ok(!applyBlock(once, buildRules([POSTS[1]])).includes('merge-pdfs'));
});

test('senza marcatori nel .htaccess non cambia nulla', () => {
  assert.equal(applyBlock('RewriteEngine On\n', buildRules(POSTS)), null);
});

test('la lista delle lingue è la stessa di language.service.ts', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'app', 'core', 'services', 'language.service.ts'), 'utf8');
  const m = /NON_DEFAULT_LANGS: Lang\[\] = \[([^\]]*)\]/.exec(src);
  const langs = m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  assert.deepEqual(NON_DEFAULT_LANGS, langs);
});

test('il .htaccess del sito ha i marcatori, dentro il blocco di RewriteEngine', () => {
  const ht = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'public', '.htaccess'), 'utf8');
  assert.ok(ht.includes(BEGIN) && ht.includes(END));
  assert.ok(ht.indexOf('RewriteEngine On') < ht.indexOf(BEGIN));
  // prima delle regole che servono i file prerenderizzati, altrimenti l'alias risponderebbe 200
  assert.ok(ht.indexOf(BEGIN) < ht.indexOf('RewriteCond %{REQUEST_FILENAME} -d'));
});

function tmpBuild(htaccess, posts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-redirects-'));
  fs.writeFileSync(path.join(dir, '.htaccess'), htaccess);
  const file = path.join(dir, 'blog-posts.json');
  if (posts) fs.writeFileSync(file, JSON.stringify({ posts }));
  return { dir, file };
}

test('integrazione: build finta -> .htaccess con i redirect', () => {
  const { dir, file } = tmpBuild(`RewriteEngine On\n  ${BEGIN}\n  ${END}\n`, POSTS);
  assert.equal(processBuild(dir, file), 3);
  assert.ok(fs.readFileSync(path.join(dir, '.htaccess'), 'utf8').includes('^pt/blog/unire-pdf/?$ /pt/blog/juntar-pdf'));
});

test('integrazione: senza il file degli articoli il .htaccess resta identico', () => {
  const original = `RewriteEngine On\n  ${BEGIN}\n  ${END}\n`;
  const { dir, file } = tmpBuild(original, null);
  assert.equal(processBuild(dir, file), 0);
  assert.equal(fs.readFileSync(path.join(dir, '.htaccess'), 'utf8'), original);
});

test('integrazione: senza .htaccess non fallisce', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-redirects-'));
  assert.equal(processBuild(dir, path.join(dir, 'x.json')), 0);
});
