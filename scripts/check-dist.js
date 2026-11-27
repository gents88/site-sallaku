#!/usr/bin/env node
/**
 * Controlli di integrità sulla build prima del rilascio: legge le pagine HTML generate e verifica
 *  - che ogni pagina del sitemap esista;
 *  - che ogni link interno, immagine, script, stile, font, icona e manifest punti a un file che c'è;
 *  - titolo, descrizione, canonical e un solo H1 in ogni pagina pubblica;
 *  - che nel testo visibile non siano rimaste chiavi di traduzione grezze (es. "home_v2.cta_tools"),
 *    segnaposto ("lorem ipsum", "TODO", "undefined", "[object Object]", "{{…}}");
 *  - che nei file della build non ci siano chiavi o password (token di servizi, chiavi private, stringhe di connessione).
 *
 * Non esce con errore per i link esterni (non si possono provare offline): li elenca solo.
 *
 * Uso: node scripts/check-dist.js <cartella della build> [--json]
 */
const fs = require('fs');
const path = require('path');

// ── Segreti ────────────────────────────────────────────────────────────────
// Solo forme che un vero segreto ha: un nome di variabile non basta (il codice cita "GROQ_API_KEY" nei messaggi).
const SECRET_PATTERNS = [
  ['chiave privata', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ['token di GitHub', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['chiave AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['chiave Google API', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['chiave Groq', /\bgsk_[A-Za-z0-9]{40,}\b/],
  ['chiave OpenAI/Anthropic', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['token Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['stringa di connessione con password', /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^\s:@/"']+:[^\s@/"']+@[^\s"']+/],
  ['JWT completo', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/],
  ['password in chiaro', /\b(?:password|passwd|secret|api[_-]?key|token)["']?\s*[:=]\s*["'][A-Za-z0-9/+_-]{16,}["']/i],
];

// Valori che sono pubblici per natura o segnaposto documentati (es. id di misurazione, chiavi "publishable").
const SECRET_ALLOW = [/G-[A-Z0-9]{8,}/, /pk_(?:live|test)_/, /your[-_]?(?:api[-_]?)?key/i, /example|placeholder|changeme|xxxx/i];

/** Negli articoli i tutorial mostrano stringhe di connessione e password d'esempio: lì si cercano solo chiavi vere. */
const EXAMPLE_PRONE = new Set(['stringa di connessione con password', 'password in chiaro']);

function scanSecrets(text, { article = false } = {}) {
  const found = [];
  for (const [label, re] of SECRET_PATTERNS) {
    if (article && EXAMPLE_PRONE.has(label)) continue;
    const m = re.exec(text);
    if (m && !SECRET_ALLOW.some((a) => a.test(m[0]))) found.push({ label, sample: `${m[0].slice(0, 6)}…(${m[0].length} caratteri)` });
  }
  return found;
}

// ── HTML ───────────────────────────────────────────────────────────────────
const PLACEHOLDERS = [
  [/lorem ipsum/i, 'lorem ipsum'],
  [/\b(?:TODO|FIXME|XXX)\b/, 'TODO/FIXME'],
  [/\[object Object\]/, '[object Object]'],
  [/\{\{[^}]*\}\}/, '{{…}} non risolto'],
  [/(?:^|\s)undefined(?:\s|$)/, '"undefined" visibile'],
  [/(?:^|\s)NaN(?:\s|$)/, '"NaN" visibile'],
  [/\bplaceholder(?:\s+text)?\b/i, '"placeholder" visibile'],
];

function stripNonVisible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
}

function visibleText(html) {
  return stripNonVisible(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Riferimenti a file/pagine dell'applicazione presenti nell'HTML. */
function references(html) {
  const refs = [];
  const attr = /\s(href|src|poster|data-src)\s*=\s*"([^"]*)"/gi;
  const body = html.replace(/<script(?![^>]*\bsrc=)[\s\S]*?<\/script>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const m of body.matchAll(attr)) refs.push({ attr: m[1].toLowerCase(), url: m[2] });
  for (const m of body.matchAll(/\ssrcset\s*=\s*"([^"]*)"/gi)) {
    for (const part of m[1].split(',')) refs.push({ attr: 'srcset', url: part.trim().split(/\s+/)[0] });
  }
  return refs;
}

function isInternal(url) {
  if (!url || url.startsWith('#') || url.startsWith('//')) return false;
  if (/^(?:mailto|tel|sms|javascript|data|blob|whatsapp|tg|intent):/i.test(url)) return false;
  if (/^https?:\/\//i.test(url)) return /^https?:\/\/(?:www\.)?gentsallaku\.it(?:[/?#]|$)/i.test(url);
  return true;
}

// ── File system ────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** Rotte dell'app servite dal backend o dalla shell (non hanno un file prerenderizzato). */
const DYNAMIC_ROUTE = /^\/(?:api\/|dashboard(?:\/|$)|search(?:\/|$)|newsletter(?:\/|$)|lab\/i-miei-file|lab\/open-file)/;
const LANG = '(?:en|sq|es|pt|fr|de)';
// Articoli e progetti: se non sono prerenderizzati li serve la shell SEO del backend (vedi .htaccess).
const dynamic = (p) => new RegExp(`^(?:/${LANG})?(?:/api/|/dashboard(?:/|$)|/search(?:/|$)|/newsletter(?:/|$)|/lab/i-miei-file|/lab/open-file|/blog/[^/]+|/projects/[^/]+)`).test(p) || DYNAMIC_ROUTE.test(p);

function resolves(dist, urlPath, fileSet) {
  let p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  if (!p.startsWith('/')) return true; // relativo: non verificabile qui
  if (p === '/') return fileSet.has('homepage/index.html') || fileSet.has('index.html');
  const rel = p.replace(/^\//, '').replace(/\/$/, '');
  if (fileSet.has(rel) || fileSet.has(`${rel}/index.html`) || fileSet.has(`${rel}.html`)) return true;
  // La home di ogni lingua (/en) è servita da <lingua>/homepage/index.html (vedi .htaccess).
  const lang = new RegExp(`^(${LANG})$`).exec(rel);
  if (lang && fileSet.has(`${lang[1]}/homepage/index.html`)) return true;
  if (rel === '' ) return true;
  return false;
}

function check(dist) {
  const problems = [];
  const warn = [];
  const add = (page, kind, detail) => problems.push({ page, kind, detail });

  const files = walk(dist);
  const fileSet = new Set(files.map((f) => path.relative(dist, f).split(path.sep).join('/')));

  // Chiavi di traduzione di primo livello: un "tools.pdf_title" nel testo è una traduzione mancante.
  let i18nTop = [];
  try { i18nTop = Object.keys(JSON.parse(fs.readFileSync(path.join(dist, 'i18n', 'it.json'), 'utf8'))); } catch { /* senza file: controllo saltato */ }
  const keyLeak = i18nTop.length ? new RegExp(`(?<![A-Za-z0-9_./-])(?:${i18nTop.join('|')})\\.[a-z][a-z0-9_]*(?:\\.[a-z0-9_]+)*(?![A-Za-z0-9_-])`) : null;

  // Sitemap: ogni indirizzo deve esistere.
  const smPath = path.join(dist, 'sitemap.xml');
  let sitemapUrls = [];
  if (fs.existsSync(smPath)) {
    sitemapUrls = [...fs.readFileSync(smPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const u of sitemapUrls) {
      const p = u.replace(/^https?:\/\/gentsallaku\.it/, '') || '/';
      if (dynamic(p)) continue;
      if (!resolves(dist, p, fileSet)) add(u, 'sitemap', 'indirizzo nel sitemap senza pagina generata');
    }
  } else warn.push('sitemap.xml assente nella build');

  const external = new Set();
  const pages = files.filter((f) => f.endsWith('.html') && !/\/(?:index\.csr|googleee[0-9a-f]+|services)\.html$/.test(f));
  let checkedRefs = 0;
  for (const file of pages) {
    const rel = path.relative(dist, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const page = rel.replace(/index\.html$/, '') || '/';
    // Articolo del blog: testo scritto a mano con esempi di codice ({{ }}, "undefined", "placeholder", app.routes.ts…).
    const article = new RegExp(`^(?:${LANG}/)?blog/[^/]+/index\\.html$`).test(rel);

    // Link e risorse
    for (const { url } of references(html)) {
      if (!url) continue;
      if (/^https?:\/\//i.test(url) && !isInternal(url)) { external.add(url); continue; }
      if (!isInternal(url)) continue;
      const p = url.replace(/^https?:\/\/(?:www\.)?gentsallaku\.it/i, '') || '/';
      if (dynamic(p)) continue;
      checkedRefs++;
      if (!resolves(dist, p, fileSet)) add(page, 'link/risorsa', `non trovato: ${url}`);
    }

    // Testo visibile
    const text = visibleText(html);
    for (const [re, label] of article ? [] : PLACEHOLDERS) {
      const m = re.exec(text);
      if (m) add(page, 'segnaposto', `${label}: «…${text.slice(Math.max(0, m.index - 25), m.index + 40)}…»`);
    }
    if (keyLeak && !article) {
      const m = keyLeak.exec(text);
      if (m) add(page, 'traduzione mancante', `chiave grezza nel testo: ${m[0]}`);
    }

    // Pagine pubbliche: SEO di base
    if (/^(?:admin|dashboard)/.test(rel)) continue;
    const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
    if (!title) add(page, 'seo', 'manca il <title>');
    else if (title.length > 70) warn.push(`${page}: title lungo (${title.length} caratteri)`);
    if (!/<meta\s+name="description"\s+content="[^"]{20,}"/i.test(html)) add(page, 'seo', 'manca la meta description (o è troppo corta)');
    if (!/<link\s+rel="canonical"\s+href="https:\/\/gentsallaku\.it[^"]*"/i.test(html)) add(page, 'seo', 'manca il canonical');
    const h1 = (stripNonVisible(html).match(/<h1[\s>]/gi) || []).length;
    if (h1 !== 1) (article && h1 > 1 ? warn.push(`${page}: ${h1} H1 (uno è nel testo dell'articolo)`) : add(page, 'seo', `H1 trovati: ${h1} (ne serve uno)`));
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/\salt\s*=/.test(t));
    if (imgs.length) (article ? warn.push(`${page}: ${imgs.length} immagini senza alt nell'articolo`) : add(page, 'accessibilità', `${imgs.length} immagini senza attributo alt`));
    if (!/<html[^>]*\slang="[a-zA-Z-]+"/.test(html)) add(page, 'accessibilità', 'manca lang su <html>');
  }

  // Segreti: in tutti i file di testo della build (script, stili, pagine, dati).
  for (const f of files) {
    if (!/\.(?:js|mjs|css|html|json|txt|xml|map|webmanifest|svg)$/i.test(f)) continue;
    const size = fs.statSync(f).size;
    if (size > 8 * 1024 * 1024) continue;
    const rel = path.relative(dist, f).split(path.sep).join('/');
    const article = new RegExp(`^(?:${LANG}/)?blog/[^/]+/index\\.html$`).test(rel);
    for (const s of scanSecrets(fs.readFileSync(f, 'utf8'), { article })) add(rel, 'segreto', `${s.label}: ${s.sample}`);
  }
  for (const hidden of ['.env', '.git', '.htpasswd']) {
    if (fileSet.has(hidden) || [...fileSet].some((f) => f.startsWith(`${hidden}/`))) add(hidden, 'segreto', 'file riservato nella build');
  }

  return { problems, warn, stats: { pagine: pages.length, sitemap: sitemapUrls.length, riferimenti: checkedRefs, esterni: [...external] } };
}

if (require.main === module) {
  const dist = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!dist || !fs.existsSync(dist)) {
    console.error('Uso: node scripts/check-dist.js <cartella della build> [--json]');
    process.exit(2);
  }
  const { problems, warn, stats } = check(dist);
  if (asJson) console.log(JSON.stringify({ problems, warn, stats }, null, 2));
  else {
    console.log(`[check-dist] ${stats.pagine} pagine, ${stats.sitemap} indirizzi nel sitemap, ${stats.riferimenti} link e risorse controllati.`);
    console.log(`[check-dist] link esterni (non verificabili offline): ${stats.esterni.length}`);
    warn.forEach((w) => console.warn(`  avviso: ${w}`));
    const byKind = {};
    for (const p of problems) (byKind[p.kind] ??= []).push(p);
    for (const [kind, list] of Object.entries(byKind)) {
      console.error(`\n✗ ${kind}: ${list.length}`);
      list.slice(0, 15).forEach((p) => console.error(`   ${p.page}  →  ${p.detail}`));
      if (list.length > 15) console.error(`   … altri ${list.length - 15}`);
    }
    console.log(problems.length ? `\n[check-dist] ${problems.length} problemi.` : '\n[check-dist] nessun problema.');
  }
  process.exit(problems.length ? 1 : 0);
}

module.exports = { check, scanSecrets, visibleText, references, isInternal, resolves };
