const fs = require('fs');
const path = require('path');

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

const routes = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/projects', changefreq: 'monthly', priority: '0.95' },
  { loc: '/blog', changefreq: 'weekly', priority: '0.9' },
  { loc: '/services', changefreq: 'monthly', priority: '0.8' },
  { loc: '/contact', changefreq: 'yearly', priority: '0.7' },
];

const today = formatDate(new Date());

function buildXml(entries) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ''];
  for (const e of entries) {
    lines.push('  <url>');
    lines.push(`    <loc>https://gentsallaku.it${e.loc}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    if (e.changefreq) lines.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) lines.push(`    <priority>${e.priority}</priority>`);
    lines.push('  </url>');
    lines.push('');
  }
  lines.push('</urlset>');
  return lines.join('\n');
}

const xml = buildXml(routes);

const targets = [
  path.join(__dirname, '..', 'public', 'sitemap.xml'),
  path.join(__dirname, '..', 'portfolio-frontend', 'public', 'sitemap.xml'),
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

console.log('Sitemap generation complete.');

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

if (process.env.PING_SITEMAP === 'true') {
  notifySearchEngines().catch((err) => console.warn('Notify failed', err && err.message ? err.message : err));
}
