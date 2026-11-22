const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { collectHashes, rewriteScriptSrc, decodeEntities, sha256, MAX_HASHES } = require('./csp-hashes.js');

const h = (text) => `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;
const run = (dir) => spawnSync('node', [path.join(__dirname, 'csp-hashes.js'), dir], { encoding: 'utf8' });

test('hash di uno script inline: testo esatto fra i tag, spazi compresi', () => {
  const body = "\n  window.__X__ = 1;\n";
  assert.deepEqual([...collectHashes(`<script>${body}</script>`)], [h(body)]);
});

test('ignora gli script con src, anche se hanno attributi async/type=module', () => {
  const html = '<script src="/main.js" type="module"></script><script async src="https://x.test/a.js"></script>';
  assert.equal(collectHashes(html).size, 0);
});

test('ignora i blocchi di dati (JSON-LD, application/json) che il browser non esegue', () => {
  const html = '<script type="application/ld+json">{"@type":"Person"}</script><script id="ng-state" type="application/json">{}</script>';
  assert.equal(collectHashes(html).size, 0);
});

test('hash anche per gli script inline di tipo module', () => {
  assert.deepEqual([...collectHashes('<script type="module">import("/a.js")</script>')], [h('import("/a.js")')]);
});

test('hash degli handler on*: valore decodificato, come fa il browser', () => {
  const html = `<link rel="stylesheet" href="s.css" media="print" onload="this.media='all'">`;
  assert.deepEqual([...collectHashes(html)], [h("this.media='all'")]);
});

test('gli handler con entità HTML vengono decodificati prima dell\'hash', () => {
  const html = '<link rel="preload" as="style" href="a.css" onload="this.onload=null;this.rel=&#39;stylesheet&#39;">';
  assert.deepEqual([...collectHashes(html)], [h("this.onload=null;this.rel='stylesheet'")]);
});

test('onload con apici singoli e valore fra virgolette doppie, come in index.html', () => {
  const html = `<link rel="preload" as="style" href="/a.css" onload="this.onload=null;this.rel='stylesheet'" />`;
  assert.deepEqual([...collectHashes(html)], [h("this.onload=null;this.rel='stylesheet'")]);
});

test('un "onclick=" dentro un testo, uno stile o un commento non conta', () => {
  const html = '<p>scrivi onclick="x()" nel codice</p><style>a[onclick="y()"]{}</style><!-- <b onclick="z()"> -->';
  assert.equal(collectHashes(html).size, 0);
});

test('lo stesso contenuto in più pagine produce gli stessi hash (nessun duplicato nell\'insieme)', () => {
  const page = '<script>var a=1</script><link onload="this.media=\'all\'">';
  assert.equal(new Set([...collectHashes(page), ...collectHashes(page)]).size, 2);
});

test('script vuoti non producono hash', () => {
  assert.equal(collectHashes('<script></script>').size, 0);
});

test('decodeEntities gestisce le entità comuni', () => {
  assert.equal(decodeEntities('a&amp;b &lt;c&gt; &quot;d&quot; &#39;e&#39;'), `a&b <c> "d" 'e'`);
});

test('sha256 produce il formato CSP', () => {
  assert.match(sha256('x'), /^'sha256-[A-Za-z0-9+/]+=*'$/);
});

const HTACCESS = `Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; object-src 'none'"`;

test('rewriteScriptSrc toglie unsafe-inline da script-src e aggiunge gli hash', () => {
  const out = rewriteScriptSrc(HTACCESS, ["'sha256-AAA='", "'sha256-BBB='"]);
  const scriptSrc = /script-src[^;]*/.exec(out)[0];
  assert.equal(
    scriptSrc,
    "script-src 'self' 'unsafe-hashes' 'sha256-AAA=' 'sha256-BBB=' https://www.googletagmanager.com https://challenges.cloudflare.com",
  );
});

test('rewriteScriptSrc lascia intatto style-src e il resto', () => {
  const out = rewriteScriptSrc(HTACCESS, ["'sha256-AAA='"]);
  assert.match(out, /style-src 'self' 'unsafe-inline'; object-src 'none'/);
  assert.match(out, /default-src 'self'/);
});

test('rewriteScriptSrc non cambia nulla senza hash (fail-safe)', () => {
  assert.equal(rewriteScriptSrc(HTACCESS, []), null);
});

test('rewriteScriptSrc non cambia nulla se script-src non ha unsafe-inline', () => {
  assert.equal(rewriteScriptSrc(HTACCESS.replace("'unsafe-inline' https", 'https'), ["'sha256-AAA='"]), null);
});

test('rewriteScriptSrc non cambia nulla senza script-src', () => {
  assert.equal(rewriteScriptSrc('Header set X-Frame-Options "SAMEORIGIN"', ["'sha256-AAA='"]), null);
});

test('integrazione: build finta -> .htaccess riscritto con tutti gli hash delle pagine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  try {
    fs.mkdirSync(path.join(dir, 'it'));
    fs.writeFileSync(path.join(dir, '.htaccess'), HTACCESS);
    fs.writeFileSync(path.join(dir, 'index.html'), '<script>var home=1</script><link onload="this.media=\'all\'">');
    fs.writeFileSync(path.join(dir, 'it', 'blog.html'), '<script>var blog=1</script><link onload="this.media=\'all\'">');
    const { status, stdout } = run(dir);

    assert.equal(status, 0);
    assert.match(stdout, /3 hash da 2 pagine/);
    const out = fs.readFileSync(path.join(dir, '.htaccess'), 'utf8');
    for (const text of ['var home=1', 'var blog=1', "this.media='all'"]) assert.ok(out.includes(h(text)), text);
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(out));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('integrazione: senza .htaccess non fallisce e non crea nulla', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  try {
    assert.equal(run(dir).status, 0);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('integrazione: nessuna pagina con script inline lascia il .htaccess identico', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  try {
    fs.writeFileSync(path.join(dir, '.htaccess'), HTACCESS);
    fs.writeFileSync(path.join(dir, 'index.html'), '<script src="/main.js"></script>');
    assert.equal(run(dir).status, 0);
    assert.equal(fs.readFileSync(path.join(dir, '.htaccess'), 'utf8'), HTACCESS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('integrazione: troppi hash (script inline diverso in ogni pagina) -> .htaccess invariato', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  try {
    fs.writeFileSync(path.join(dir, '.htaccess'), HTACCESS);
    for (let i = 0; i <= MAX_HASHES; i++) fs.writeFileSync(path.join(dir, `p${i}.html`), `<script>var page=${i}</script>`);
    const { status, stderr } = run(dir);

    assert.equal(status, 0);
    assert.match(stderr, /oltre 60/);
    assert.equal(fs.readFileSync(path.join(dir, '.htaccess'), 'utf8'), HTACCESS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('integrazione: esattamente al limite viene riscritto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
  try {
    fs.writeFileSync(path.join(dir, '.htaccess'), HTACCESS);
    for (let i = 0; i < MAX_HASHES; i++) fs.writeFileSync(path.join(dir, `p${i}.html`), `<script>var page=${i}</script>`);
    run(dir);

    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(fs.readFileSync(path.join(dir, '.htaccess'), 'utf8')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
