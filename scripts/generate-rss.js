const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://gentsallaku.it';
const FEED_TITLE = 'Gent Sallaku — Blog';
const FEED_DESCRIPTION = 'Articoli su sviluppo front-end, Angular, TypeScript e data visualization.';

const API_BASE_URL = process.env.SITEMAP_API_URL
  || process.env.API_BASE_URL
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Fetches every published post (paginated, 50/page server-side cap), newest first. */
async function fetchPosts() {
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
        posts.push(post);
      }

      totalPages = json.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn('Could not fetch blog posts for RSS feed:', err.message);
    return [];
  }

  return posts;
}

function buildXml(posts) {
  const now = new Date().toUTCString();

  const items = posts.map((post) => {
    const link = `${SITE_URL}/blog/${post.slug}`;
    const pubDate = post.publishedAt ? new Date(post.publishedAt).toUTCString() : now;
    const categories = (post.tags ?? [])
      .map((tag) => `      <category>${escapeXml(tag)}</category>`)
      .join('\n');

    return [
      '  <item>',
      `    <title>${escapeXml(post.title)}</title>`,
      `    <link>${link}</link>`,
      `    <guid isPermaLink="true">${link}</guid>`,
      `    <pubDate>${pubDate}</pubDate>`,
      `    <description>${escapeXml(post.excerpt)}</description>`,
      categories,
      '  </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `  <title>${escapeXml(FEED_TITLE)}</title>`,
    `  <link>${SITE_URL}/blog</link>`,
    `  <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    `  <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    '  <language>it-it</language>',
    `  <lastBuildDate>${now}</lastBuildDate>`,
    items,
    '</channel>',
    '</rss>',
  ].filter(Boolean).join('\n');
}

async function main() {
  const posts = await fetchPosts();
  const xml = buildXml(posts);

  const targets = [
    path.join(__dirname, '..', 'public', 'rss.xml'),
    path.join(__dirname, '..', 'frontend', 'public', 'rss.xml'),
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

  console.log(`RSS feed generation complete. (${posts.length} post${posts.length === 1 ? '' : 's'} included)`);
}

main();
