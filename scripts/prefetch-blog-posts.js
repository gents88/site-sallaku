// Downloads every published blog post (full content) once, before the build,
// into frontend/.prerender-cache/blog-posts.json. The prerender step reads it
// via frontend/src/app/prerender-blog-posts.ts and the
// prerender-blog-cache.interceptor, so the ~300 post×language routes don't
// hammer the live API (which tripped the throttle and produced "Post not
// found" pages). Never fails the build: on any error it writes what it has
// (or nothing) and the prerender falls back to the live API.
const fs = require('fs');
const path = require('path');

const API_BASE_URL = process.env.SITEMAP_API_URL
  || process.env.API_BASE_URL
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

const OUT_DIR = path.join(__dirname, '..', 'frontend', '.prerender-cache');
const OUT_FILE = path.join(OUT_DIR, 'blog-posts.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET json with retry/backoff on 429 and 5xx. */
async function getJson(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** i);
    } catch (err) {
      if (i === attempts - 1 || /^HTTP 4/.test(err.message)) throw err;
      await sleep(1000 * 2 ** i);
    }
  }
  throw new Error('retries exhausted');
}

async function fetchSlugs() {
  const slugs = [];
  let page = 1;
  let totalPages = 1;
  do {
    const json = await getJson(`${API_BASE_URL}/blog/posts?page=${page}&limit=50`);
    for (const p of json.data ?? []) if (p.slug) slugs.push(p.slug);
    totalPages = json.totalPages ?? 1;
    page += 1;
  } while (page <= totalPages);
  return slugs;
}

async function main() {
  const posts = [];
  try {
    const slugs = await fetchSlugs();
    for (const slug of slugs) {
      try {
        posts.push(await getJson(`${API_BASE_URL}/blog/posts/${encodeURIComponent(slug)}`));
      } catch (err) {
        console.warn(`[prefetch-blog] skipping "${slug}": ${err.message}`);
      }
      await sleep(150);
    }
  } catch (err) {
    console.warn(`[prefetch-blog] could not list posts — prerender will use the live API: ${err.message}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ fetchedAt: new Date().toISOString(), posts }));
  console.log(`[prefetch-blog] ${posts.length} posts saved to ${path.relative(process.cwd(), OUT_FILE)}`);
}

main();
