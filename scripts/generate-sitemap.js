const fs = require('fs');
const path = require('path');

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

const API_BASE_URL = process.env.SITEMAP_API_URL
  || process.env.API_BASE_URL
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

const routes = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/projects', changefreq: 'monthly', priority: '0.95' },
  { loc: '/blog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/services', changefreq: 'monthly', priority: '0.8' },
  { loc: '/contact', changefreq: 'yearly', priority: '0.7' },

  // ── AI & PDF Tools — public tool pages (Allow-listed in robots.txt) ──
  { loc: '/dashboard/tools', changefreq: 'monthly', priority: '0.9' },
  { loc: '/dashboard/pdf-translate', changefreq: 'monthly', priority: '0.88' },
  { loc: '/dashboard/ai-ppt', changefreq: 'monthly', priority: '0.87' },
  { loc: '/dashboard/pdf-summary', changefreq: 'monthly', priority: '0.86' },
  { loc: '/dashboard/ai-formatter', changefreq: 'monthly', priority: '0.85' },
  { loc: '/dashboard/convert', changefreq: 'monthly', priority: '0.84' },
  { loc: '/dashboard/ocr', changefreq: 'monthly', priority: '0.83' },
  { loc: '/dashboard/pdf-editor', changefreq: 'monthly', priority: '0.82' },
  { loc: '/dashboard/viewer', changefreq: 'monthly', priority: '0.8' },
  { loc: '/dashboard/editor', changefreq: 'monthly', priority: '0.8' },
  { loc: '/dashboard/scanner', changefreq: 'monthly', priority: '0.8' },
];

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

async function main() {
  const blogRoutes = await fetchBlogRoutes();
  const xml = buildXml([...routes, ...blogRoutes]);

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

main();
