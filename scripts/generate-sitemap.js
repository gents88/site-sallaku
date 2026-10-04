const fs = require('fs');
const path = require('path');

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

const API_BASE_URL = process.env.SITEMAP_API_URL
  || process.env.API_BASE_URL
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

// Keep in sync with frontend/src/app/core/services/language.service.ts's NON_DEFAULT_LANGS.
const NON_DEFAULT_LANGS = ['en', 'sq', 'es', 'pt', 'fr', 'de'];

// Language-prefixed path for a default-language `loc`, matching
// app.routes.server.ts's `:lang/<page>` prerender routes and
// LanguageService.withLangPrefix(). '/' is special-cased to 'homepage'
// (the root '/' is a `redirectTo` route, never itself prerendered — see
// app.routes.server.ts's STATIC_PUBLIC_PAGES comment); every other route's
// page slug is just its loc without the leading slash.
function langLoc(loc, lang) {
  const page = loc === '/' ? 'homepage' : loc.replace(/^\//, '');
  return `/${lang}/${page}`;
}

// Pagine statiche dal registro unico della navigazione (stesso file letto da
// navbar, sidebar, ricerca e prerender): solo le voci con `sitemap`. Prima la
// lista era duplicata qui a mano e divergeva dal prerender (/lab/library).
const NAV_REGISTRY = require('../frontend/src/app/core/navigation/nav-registry.json');

function staticRoutes(registry = NAV_REGISTRY) {
  return registry
    .filter((e) => e.sitemap)
    .map((e) => ({ loc: e.sitemap.loc || e.route, changefreq: e.sitemap.changefreq, priority: e.sitemap.priority }));
}

const routes = staticRoutes();

const today = formatDate(new Date());

function buildXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ''];
  for (const e of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>https://gentsallaku.it${e.loc}</loc>`);
    lines.push(`    <lastmod>${e.lastmod || today}</lastmod>`);
    if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
    lines.push('  </url>');
    lines.push('');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

/** Fetches every published post (paginated, 50/page server-side cap) and maps it to a sitemap entry. */
async function fetchBlogRoutes() {
  const posts = [];
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const res = await fetch(`${API_BASE_URL}/blog/posts?page=${page}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      for (const post of json.data ?? []) {
        if (!post.slug) continue;
        posts.push({
          loc: `/blog/${post.slug}`,
          // Translated slug per language (backend slug_xx, from title_xx) —
          // must match blog-detail's canonical, which uses the same fallback.
          langLocs: Object.fromEntries(NON_DEFAULT_LANGS.map(l => [l, `/${l}/blog/${post[`slug_${l}`] || post.slug}`])),
          changefreq: 'monthly',
          priority: '0.75',
          lastmod: post.publishedAt ? formatDate(new Date(post.publishedAt)) : today,
        });
      }

      totalPages = json.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn('Could not fetch blog posts for sitemap — falling back to /blog only:', err.message);
    return [];
  }

  return posts;
}

// Optionally ping search engines to notify of updated sitemap
function ping(url) {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      https
        .get(url, (res) => {
          res.on('data', () => {});
          res.on('end', () => resolve({ url, status: res.statusCode }));
        })
        .on('error', (err) => resolve({ url, error: err.message }));
    } catch (err) {
      resolve({ url, error: err && err.message ? err.message : err });
    }
  });
}

async function notifySearchEngines() {
  const sitemapUrl = 'https://gentsallaku.it/sitemap.xml';
  const endpoints = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];

  for (const e of endpoints) {
    const r = await ping(e);
    if (r.error) console.warn('Ping failed:', r);
    else console.log('Ping result:', r);
  }
}

/** Expands a list of default-language (IT) entries into their prerendered lang-prefixed siblings. */
function withLangVariants(entries) {
  const variants = [];
  for (const e of entries) {
    for (const lang of NON_DEFAULT_LANGS) {
      const { langLocs, ...entry } = e;
      variants.push({ ...entry, loc: langLocs?.[lang] ?? langLoc(e.loc, lang) });
    }
  }
  return variants;
}

/** Progetti con case study (stesso criterio del prerender in app.routes.server.ts). */
async function fetchProjectRoutes() {
  try {
    const res = await fetch(`${API_BASE_URL}/projects`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const projects = await res.json();
    return projects
      .filter((p) => p.slug && [p.problem, p.solution, p.results].some((t) => t && t.trim()))
      .map((p) => ({
        loc: `/projects/${p.slug}`,
        changefreq: 'monthly',
        priority: '0.8',
        lastmod: p.updatedAt ? formatDate(new Date(p.updatedAt)) : today,
      }));
  } catch (err) {
    console.warn('Could not fetch projects for sitemap — skipping case studies:', err.message);
    return [];
  }
}

async function main() {
  const blogRoutes = await fetchBlogRoutes();
  const projectRoutes = await fetchProjectRoutes();
  const xml = buildXml([
    ...routes,
    ...withLangVariants(routes),
    ...projectRoutes,
    ...withLangVariants(projectRoutes),
    ...blogRoutes.map(({ langLocs, ...entry }) => entry),
    ...withLangVariants(blogRoutes),
  ]);

  const targets = [
    path.join(__dirname, '..', 'public', 'sitemap.xml'),
    path.join(__dirname, '..', 'frontend', 'public', 'sitemap.xml'),
  ];

  for (const t of targets) {
    try {
      const dir = path.dirname(t);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(t, xml, 'utf8');
      console.log('Wrote', t);
    } catch (err) {
      console.error('Failed to write', t, err && err.message ? err.message : err);
    }
  }

  console.log(`Sitemap generation complete. (${blogRoutes.length} blog post${blogRoutes.length === 1 ? '' : 's'} included)`);

  if (process.env.PING_SITEMAP === 'true') {
    await notifySearchEngines().catch((err) => console.warn('Notify failed', err && err.message ? err.message : err));
  }
}

// Eseguito solo da riga di comando: `require()` (es. dai test) non scrive file.
if (require.main === module) {
  main();
}

module.exports = { staticRoutes, buildXml, withLangVariants };
