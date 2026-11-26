#!/usr/bin/env node
/**
 * Genera nel .htaccess della build i redirect 301 dagli indirizzi "alias" degli articoli verso quelli giusti.
 *
 * Gli articoli tradotti hanno uno slug per lingua (/pt/blog/<slug_pt>), ma esistono vecchi link che usano
 * lo slug italiano sotto il prefisso di una lingua (/pt/blog/<slug-italiano>): condivisi sui social o scoperti
 * da Google prima che gli slug fossero tradotti. Servire lì un duplicato con un canonical lascia Google a
 * decidere (e per anni compariva "soft 404" in Search Console); un 301 verso l'indirizzo giusto, nella stessa
 * lingua, è un segnale chiaro e Google lo gestisce da solo.
 *
 * Le regole si generano dagli articoli che il build ha già scaricato (frontend/.prerender-cache/blog-posts.json),
 * quindi seguono i contenuti senza manutenzione a mano. Vanno nel blocco fra i due marcatori del .htaccess.
 *
 * Fail-safe: senza articoli, senza marcatori o con qualunque errore il .htaccess resta com'è.
 *
 * Uso: node scripts/blog-redirects.js <cartella della build> [file degli articoli]
 */
const fs = require('fs');
const path = require('path');

// Allineato a NON_DEFAULT_LANGS di frontend/src/app/core/services/language.service.ts (lo controlla il test).
const NON_DEFAULT_LANGS = ['en', 'sq', 'es', 'pt', 'fr', 'de'];

const BEGIN = '# @blog-alias-redirects:begin';
const END = '# @blog-alias-redirects:end';
const SLUG = /^[A-Za-z0-9._~-]+$/;

const escapeRegex = (s) => s.replace(/[.]/g, '\\.');

/**
 * Regole (una per articolo e lingua) per gli slug italiani che differiscono da quello della lingua.
 * Gli slug con caratteri fuori dal set che usa Apache per le rotte del blog si saltano: non sarebbero raggiunti.
 */
function buildRules(posts) {
  const rules = [];
  for (const post of posts) {
    if (!post || !SLUG.test(post.slug ?? '')) continue;
    for (const lang of NON_DEFAULT_LANGS) {
      const target = post[`slug_${lang}`];
      if (!target || target === post.slug || !SLUG.test(target)) continue;
      rules.push(`RewriteRule ^${lang}/blog/${escapeRegex(post.slug)}/?$ /${lang}/blog/${target} [R=301,L]`);
    }
  }
  return [...new Set(rules)].sort();
}

/** Il blocco da inserire: con una guardia che salta tutte le regole per gli indirizzi che non sono /<lingua>/blog/…. */
function renderBlock(rules) {
  if (!rules.length) return `${BEGIN}\n  ${END}`;
  const lines = [
    BEGIN,
    '  # Generato dalla build (scripts/blog-redirects.js): non modificare a mano.',
    // Senza la guardia ogni richiesta (anche un'immagine) passerebbe per tutte le regole.
    `  RewriteRule !^(?:${NON_DEFAULT_LANGS.join('|')})/blog/ - [S=${rules.length}]`,
    ...rules.map((r) => `  ${r}`),
    `  ${END}`,
  ];
  return lines.join('\n');
}

/** Sostituisce il contenuto fra i marcatori; null se i marcatori non ci sono (nessuna modifica). */
function applyBlock(htaccess, rules) {
  const start = htaccess.indexOf(BEGIN);
  const end = htaccess.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  return htaccess.slice(0, start) + renderBlock(rules) + htaccess.slice(end + END.length);
}

function processBuild(distDir, postsFile) {
  const htaccessPath = path.join(distDir, '.htaccess');
  if (!fs.existsSync(htaccessPath)) {
    console.warn(`[blog-redirects] ${htaccessPath} non trovato: nessun redirect aggiunto.`);
    return 0;
  }
  let posts = [];
  try {
    posts = JSON.parse(fs.readFileSync(postsFile, 'utf8')).posts ?? [];
  } catch {
    console.warn('[blog-redirects] articoli non disponibili: nessun redirect aggiunto.');
    return 0;
  }
  const rules = buildRules(posts);
  const next = applyBlock(fs.readFileSync(htaccessPath, 'utf8'), rules);
  if (next === null) {
    console.warn('[blog-redirects] marcatori non trovati nel .htaccess: lasciato com\'è.');
    return 0;
  }
  fs.writeFileSync(htaccessPath, next);
  console.log(`[blog-redirects] ${rules.length} redirect 301 verso gli indirizzi giusti degli articoli.`);
  return rules.length;
}

if (require.main === module) {
  const dist = process.argv[2];
  if (!dist) {
    console.error('Uso: node scripts/blog-redirects.js <cartella della build> [file degli articoli]');
    process.exit(1);
  }
  const postsFile = process.argv[3] || path.join(__dirname, '..', 'frontend', '.prerender-cache', 'blog-posts.json');
  try {
    processBuild(dist, postsFile);
  } catch (err) {
    console.warn(`[blog-redirects] non riuscito (${err.message}): .htaccess lasciato com'è.`);
  }
}

module.exports = { buildRules, renderBlock, applyBlock, processBuild, NON_DEFAULT_LANGS, BEGIN, END };
