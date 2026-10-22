#!/usr/bin/env node
/**
 * Sostituisce 'unsafe-inline' nella direttiva script-src del .htaccess della build con gli hash
 * SHA-256 degli script e degli handler inline realmente presenti nelle pagine HTML generate.
 *
 * Perché dopo la build: Angular aggiunge i suoi pezzi inline (es. l'onload dei CSS critici) e
 * il prerender produce molte pagine; gli hash validi si conoscono solo a build finita.
 *
 * Fail-safe: se non trova nulla da proteggere o non riesce a riscrivere il .htaccess, lo lascia
 * com'è (quindi con 'unsafe-inline', il comportamento di prima) e lo dice. Meglio una CSP meno
 * stretta di un sito che non carica.
 *
 * Uso: node scripts/csp-hashes.js <cartella della build, es. frontend/dist/portfolio-frontend/browser>
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Oltre questa soglia l'header diventerebbe enorme (Apache scarta le righe oltre ~8 KB) e di solito
// segnala uno script inline che cambia a ogni pagina: meglio non toccare la CSP e farlo notare.
const MAX_HASHES = 60;

// Blocchi di dati che il browser non esegue: la CSP non li riguarda.
const NON_EXECUTABLE_TYPES = /^(application\/json|application\/ld\+json|speculationrules|text\/template)$/i;

const ENTITIES = { '&quot;': '"', '&#34;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };

function decodeEntities(value) {
  return value.replace(/&(quot|#34|#39|apos|lt|gt|amp);/g, (m) => ENTITIES[m]);
}

function sha256(text) {
  return `'sha256-${crypto.createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** Hash degli script inline e degli handler on*="…" di un documento HTML. */
function collectHashes(html) {
  const hashes = new Set();
  let withoutBlocks = html;

  // 1) <script> senza src e di tipo eseguibile: l'hash è del testo esatto fra i tag.
  withoutBlocks = withoutBlocks.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (match, attrs, body) => {
    const hasSrc = /\ssrc\s*=/i.test(` ${attrs}`);
    const type = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(` ${attrs}`)?.[1] ?? '';
    if (!hasSrc && body.length > 0 && !NON_EXECUTABLE_TYPES.test(type)) hashes.add(sha256(body));
    return '';
  });

  // 2) <style> non interessa script-src, ma il suo contenuto non va scambiato per markup.
  withoutBlocks = withoutBlocks.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  withoutBlocks = withoutBlocks.replace(/<!--[\s\S]*?-->/g, '');

  // 3) Handler inline (onload="this.media='all'"): il browser fa l'hash del valore già decodificato.
  const tag = /<[a-zA-Z][^>]*>/g;
  const handler = /\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const [tagText] of withoutBlocks.matchAll(tag)) {
    for (const m of tagText.matchAll(handler)) {
      const value = decodeEntities(m[1] ?? m[2] ?? '');
      if (value.trim()) hashes.add(sha256(value));
    }
  }
  return hashes;
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (/\.html$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** Riscrive script-src: toglie 'unsafe-inline' e aggiunge 'unsafe-hashes' + gli hash. null se non c'è nulla da cambiare. */
function rewriteScriptSrc(htaccess, hashes) {
  const directive = /(script-src\b[^;"]*)/;
  const match = directive.exec(htaccess);
  if (!match || !match[1].includes("'unsafe-inline'") || hashes.length === 0) return null;
  const replaced = match[1].replace("'unsafe-inline'", `'unsafe-hashes' ${hashes.join(' ')}`);
  return htaccess.replace(directive, replaced);
}

function main(distDir) {
  const htaccessPath = path.join(distDir, '.htaccess');
  if (!fs.existsSync(distDir) || !fs.existsSync(htaccessPath)) {
    console.warn(`[csp-hashes] ${htaccessPath} non trovato: CSP lasciata com'è.`);
    return 0;
  }

  const all = new Set();
  const files = walkHtml(distDir);
  for (const file of files) collectHashes(fs.readFileSync(file, 'utf8')).forEach((h) => all.add(h));
  const hashes = [...all].sort();

  if (hashes.length > MAX_HASHES) {
    console.warn(`[csp-hashes] ${hashes.length} hash (oltre ${MAX_HASHES}): uno script inline cambia da pagina a pagina. CSP lasciata com'è.`);
    return 0;
  }

  const current = fs.readFileSync(htaccessPath, 'utf8');
  const next = rewriteScriptSrc(current, hashes);
  if (!next) {
    console.warn(`[csp-hashes] nessuna modifica (${hashes.length} hash trovati in ${files.length} pagine): CSP lasciata com'è.`);
    return 0;
  }
  fs.writeFileSync(htaccessPath, next);
  console.log(`[csp-hashes] script-src senza 'unsafe-inline': ${hashes.length} hash da ${files.length} pagine HTML.`);
  return 0;
}

module.exports = { collectHashes, rewriteScriptSrc, decodeEntities, sha256, MAX_HASHES };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Uso: node scripts/csp-hashes.js <cartella della build>');
    process.exit(2);
  }
  process.exit(main(path.resolve(dir)));
}
