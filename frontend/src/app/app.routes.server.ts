import { RenderMode, ServerRoute } from '@angular/ssr';

// Public AI/PDF tool pages under /dashboard — pre-rendered at build time so
// the static FileZilla deploy ships real HTML (title/meta/JSON-LD) for
// crawlers instead of the generic app-shell fallback. See admin.routes.ts
// for the matching Angular route list.
const PUBLIC_TOOL_PAGES = [
  'dashboard/tools',
  'dashboard/pdf-summary',
  'dashboard/ai-formatter',
  'dashboard/pdf-translate',
  'dashboard/ai-ppt',
  'dashboard/convert',
  'dashboard/pdf-editor',
  'dashboard/viewer',
  'dashboard/editor',
  'dashboard/ocr',
  'dashboard/scanner',
];

// Static top-level pages — same static-deploy reasoning as PUBLIC_TOOL_PAGES.
// 'homepage' (not '') because Angular's prerenderer skips routes with
// `redirectTo` when outputMode isn't 'static' — '' just redirects to
// 'homepage' in app.routes.ts. The root `/` is served from homepage/index.html
// via an internal rewrite in .htaccess so the canonical URL stays `/`.
const STATIC_PUBLIC_PAGES = ['homepage', 'projects', 'blog', 'contact'];

// Same API base resolution + pagination + failure fallback as
// scripts/generate-sitemap.js, so a backend outage at build time degrades
// to "no blog slugs prerendered" instead of failing the whole build.
const API_BASE_URL = process.env['SITEMAP_API_URL']
  || process.env['API_BASE_URL']
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

async function fetchBlogSlugs(): Promise<{ slug: string }[]> {
  const slugs: { slug: string }[] = [];
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const res = await fetch(`${API_BASE_URL}/blog/posts?page=${page}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      for (const post of json.data ?? []) {
        if (post.slug) slugs.push({ slug: post.slug });
      }

      totalPages = json.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn('Could not fetch blog posts for prerendering — skipping blog/:slug:', (err as Error).message);
    return [];
  }

  return slugs;
}

export const serverRoutes: ServerRoute[] = [
  ...PUBLIC_TOOL_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  ...STATIC_PUBLIC_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return fetchBlogSlugs();
    },
  },
  { path: '**', renderMode: RenderMode.Server },
];
