#!/usr/bin/env node
/**
 * Aggiunge alle pagine HTML della build un <link rel="modulepreload"> per ogni chunk importato
 * staticamente (anche indirettamente) dallo script d'ingresso, oltre a quelli che mette Angular.
 *
 * Perché: @angular/build ne inserisce al massimo 10 (MODULE_PRELOAD_MAX) e main ha decine di
 * import statici. Il core di Angular e il router restavano fuori: il browser li scopriva solo
 * dopo aver scaricato e analizzato main.js, un giro di rete in più prima del bootstrap.
 *
 * Idempotente: i chunk già precaricati non vengono ripetuti. Gli import dinamici (rotte lazy,
 * @defer) restano esclusi: non servono al primo avvio.
 *
 * Uso: node scripts/modulepreload-all.js <cartella della build, es. frontend/dist/portfolio-frontend/browser>
 */
const fs = require('fs');
const path = require('path');

// import{a as b}from"./chunk-X.js"  ·  import"./chunk-X.js"  ·  export{a}from"./chunk-X.js"
// La parentesi esclusa da [^'"()] tiene fuori gli import("./chunk-X.js") dinamici.
const STATIC_IMPORT = /(?:^|[;}\s])(?:import|export)\s*(?:[^'"()]*?from)?\s*["']\.\/([\w.-]+\.js)["']/g;
const ENTRY_SCRIPT = /<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*\btype="module"[^>]*>|<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+\.js)"[^>]*>/;
const MODULEPRELOAD = /<link\b[^>]*\brel="modulepreload"[^>]*>/g;

/** Chunk importati staticamente da un modulo (solo percorsi relativi ./, come li scrive esbuild). */
function staticImports(source) {
  const found = new Set();
  for (const m of source.matchAll(STATIC_IMPORT)) found.add(m[1]);
  return [...found];
}

/** Tutti i chunk raggiungibili per import statici da `entry`, escluso `entry` stesso. */
function moduleClosure(entry, readModule) {
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift();
    const source = readModule(current);
    if (source == null) continue;
    for (const dep of staticImports(source)) {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  seen.delete(entry);
  return [...seen];
}

/**
 * Inserisce i modulepreload mancanti prima di quelli già presenti (o prima dello script
 * d'ingresso), nell'ordine di `chunks`. Restituisce l'HTML invariato se non manca nulla.
 */
function addModulePreloads(html, chunks) {
  const existing = new Set([...html.matchAll(MODULEPRELOAD)].map(tag => (tag[0].match(/\bhref="([^"]+)"/) || [])[1]));
  const missing = chunks.filter(c => !existing.has(c));
  if (missing.length === 0) return html;

  const links = missing.map(c => `<link rel="modulepreload" href="${c}">`).join('');
  const firstPreload = html.search(MODULEPRELOAD);
  const anchor = firstPreload >= 0 ? firstPreload : html.search(ENTRY_SCRIPT);
  if (anchor < 0) return html;
  return html.slice(0, anchor) + links + html.slice(anchor);
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.isFile() && entry.name.endsWith('.html') ? [full] : [];
  });
}

/** Elabora la build: restituisce quante pagine sono state modificate. */
function processBuild(browserDir) {
  const sizes = new Map();
  const readModule = name => {
    const file = path.join(browserDir, name);
    if (!fs.existsSync(file)) return null;
    const source = fs.readFileSync(file, 'utf8');
    sizes.set(name, source.length);
    return source;
  };
  const closures = new Map();
  let changed = 0;

  for (const file of htmlFiles(browserDir)) {
    const html = fs.readFileSync(file, 'utf8');
    const entryMatch = html.match(ENTRY_SCRIPT);
    if (!entryMatch) continue;
    const entry = (entryMatch[1] || entryMatch[2]).replace(/^\.?\//, '');
    if (!closures.has(entry)) {
      // I più grandi per primi: sono quelli che tengono fermo il bootstrap più a lungo.
      const chunks = moduleClosure(entry, readModule).sort((a, b) => (sizes.get(b) || 0) - (sizes.get(a) || 0));
      closures.set(entry, chunks);
    }
    const updated = addModulePreloads(html, closures.get(entry));
    if (updated !== html) {
      fs.writeFileSync(file, updated);
      changed++;
    }
  }
  return changed;
}

module.exports = { staticImports, moduleClosure, addModulePreloads, processBuild };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error('[modulepreload-all] cartella della build mancante:', dir);
    process.exit(1);
  }
  const changed = processBuild(dir);
  console.log(`[modulepreload-all] modulepreload completati in ${changed} pagine HTML.`);
}
