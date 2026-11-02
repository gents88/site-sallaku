const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { staticImports, moduleClosure, addModulePreloads, processBuild } = require('./modulepreload-all.js');

test('import statici nel formato minificato di esbuild, esclusi quelli dinamici', () => {
  const src = 'import{a as b,c as d}from"./chunk-A.js";import"./chunk-B.js";export{x}from"./chunk-C.js";'
    + 'var r=()=>import("./chunk-LAZY.js").then(m=>m.Home);';
  assert.deepEqual(staticImports(src).sort(), ['chunk-A.js', 'chunk-B.js', 'chunk-C.js']);
});

test('chiusura transitiva: dipendenze indirette comprese, ingresso escluso, cicli gestiti', () => {
  const modules = {
    'main.js': 'import{a}from"./chunk-A.js";import("./chunk-LAZY.js");',
    'chunk-A.js': 'import{b}from"./chunk-B.js";',
    'chunk-B.js': 'import{a}from"./chunk-A.js";',
    'chunk-LAZY.js': 'import{z}from"./chunk-Z.js";',
  };
  assert.deepEqual(moduleClosure('main.js', name => modules[name]).sort(), ['chunk-A.js', 'chunk-B.js']);
});

test('aggiunge solo i modulepreload mancanti, prima di quelli che mette Angular', () => {
  const html = '<head><link rel="modulepreload" href="chunk-A.js"><script src="main.js" type="module"></script></head>';
  const out = addModulePreloads(html, ['chunk-CORE.js', 'chunk-A.js']);
  assert.equal(out, '<head><link rel="modulepreload" href="chunk-CORE.js"><link rel="modulepreload" href="chunk-A.js"><script src="main.js" type="module"></script></head>');
});

test('senza modulepreload esistenti inserisce prima dello script d\'ingresso', () => {
  const html = '<head><script src="main.js" type="module"></script></head>';
  assert.equal(addModulePreloads(html, ['chunk-A.js']), '<head><link rel="modulepreload" href="chunk-A.js"><script src="main.js" type="module"></script></head>');
});

test('idempotente: una seconda passata non cambia nulla', () => {
  const html = '<head><script src="main.js" type="module"></script></head>';
  const once = addModulePreloads(html, ['chunk-A.js']);
  assert.equal(addModulePreloads(once, ['chunk-A.js']), once);
});

test('build reale su disco: pagine annidate aggiornate, i chunk più grandi per primi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modulepreload-'));
  try {
    fs.writeFileSync(path.join(dir, 'main-X.js'), 'import{a}from"./chunk-SMALL.js";import{b}from"./chunk-BIG.js";');
    fs.writeFileSync(path.join(dir, 'chunk-SMALL.js'), 'var a=1;');
    fs.writeFileSync(path.join(dir, 'chunk-BIG.js'), `var b="${'x'.repeat(500)}";`);
    fs.mkdirSync(path.join(dir, 'about'));
    const page = '<html><head><script src="main-X.js" type="module"></script></head><body></body></html>';
    fs.writeFileSync(path.join(dir, 'about', 'index.html'), page);
    fs.writeFileSync(path.join(dir, 'senza-script.html'), '<html><head></head></html>');

    assert.equal(processBuild(dir), 1);
    const out = fs.readFileSync(path.join(dir, 'about', 'index.html'), 'utf8');
    assert.ok(out.indexOf('chunk-BIG.js') < out.indexOf('chunk-SMALL.js'));
    assert.equal(processBuild(dir), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
