const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { check, scanSecrets, isInternal } = require('./check-dist');

function site(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dist-'));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}
const page = (body, head = '') =>
  `<!doctype html><html lang="it"><head><title>Titolo</title><meta name="description" content="Una descrizione abbastanza lunga."><link rel="canonical" href="https://gentsallaku.it/about">${head}</head><body>${body}</body></html>`;

test('una pagina corretta non dà problemi', () => {
  const d = site({ 'homepage/index.html': page('<h1>Ciao</h1><a href="/about">x</a><img src="/a.png" alt="a">'), 'about/index.html': page('<h1>Chi</h1>'), 'a.png': 'x' });
  assert.deepStrictEqual(check(d).problems, []);
});

test('trova link rotti, immagini senza alt, H1 doppi e segnaposto', () => {
  const d = site({ 'homepage/index.html': page('<h1>A</h1><h1>B</h1><a href="/manca">x</a><img src="/a.png"><p>Lorem ipsum dolor</p>') });
  const kinds = check(d).problems.map((p) => p.kind).sort();
  assert.ok(kinds.includes('link/risorsa'));
  assert.ok(kinds.includes('accessibilità'));
  assert.ok(kinds.includes('segnaposto'));
  assert.ok(kinds.filter((k) => k === 'seo').length >= 1);
});

test('un H1 citato in un commento non conta', () => {
  const d = site({ 'homepage/index.html': page('<!-- <h1> --><h1>Uno</h1>'), 'about/index.html': page('<h1>Chi</h1>') });
  assert.deepStrictEqual(check(d).problems, []);
});

test('segnala le chiavi di traduzione grezze nel testo', () => {
  const d = site({ 'i18n/it.json': '{"lab_intents":{}}', 'homepage/index.html': page('<h1>A</h1><button>lab_intents.pdf_to_jpg.cta</button>') });
  assert.ok(check(d).problems.some((p) => p.kind === 'traduzione mancante'));
});

test('trova segreti ma non i semplici nomi di variabile', () => {
  assert.ok(scanSecrets('const k = "AKIAABCDEFGHIJKLMNOP";').length);
  assert.ok(scanSecrets('mongodb+srv://utente:password123@cluster0.mongodb.net/db').length);
  assert.ok(scanSecrets('-----BEGIN PRIVATE KEY-----').length);
  assert.deepStrictEqual(scanSecrets('throw new Error("manca GROQ_API_KEY")'), []);
});

test('isInternal distingue link interni ed esterni', () => {
  assert.ok(isInternal('/blog'));
  assert.ok(isInternal('https://gentsallaku.it/blog'));
  assert.ok(!isInternal('https://example.com'));
  assert.ok(!isInternal('mailto:a@b.it'));
  assert.ok(!isInternal('#top'));
});
