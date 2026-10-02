import { RenderMode, ServerRoute } from '@angular/ssr';
import { NON_DEFAULT_LANGS } from './core/services/language.service';
import { readPrerenderBlogPosts } from './prerender-blog-posts';
import { Post, localizedSlug } from './core/models/post.model';

type PostSlugs = Pick<Post, 'slug' | 'slug_en' | 'slug_sq' | 'slug_pt' | 'slug_es' | 'slug_fr' | 'slug_de'>;

// Public AI/PDF tool pages under /lab — pre-rendered at build time so the
// static FileZilla deploy ships real HTML (title/meta/JSON-LD) for crawlers
// instead of the generic app-shell fallback. See app.routes.ts for the
// matching Angular route list. Moved here from /dashboard/* (2026-08); old
// URLs 301-redirect via frontend/public/.htaccess.
const PUBLIC_TOOL_PAGES = [
  'lab',
  'lab/pdf-search',
  'lab/pdf-summary',
  'lab/ai-formatter',
  'lab/pdf-translate',
  'lab/ai-ppt',
  'lab/convert',
  'lab/pdf-editor',
  'lab/viewer',
  'lab/editor',
  'lab/ocr',
  'lab/scanner',
  'lab/workspace',
];

// Static top-level pages — same static-deploy reasoning as PUBLIC_TOOL_PAGES.
// 'homepage' (not '') because Angular's prerenderer skips routes with
// `redirectTo` when outputMode isn't 'static' — '' just redirects to
// 'homepage' in app.routes.ts. The root `/` is served from homepage/index.html
// via an internal rewrite in .htaccess so the canonical URL stays `/`.
// 'about'/'tech-stack'/'experience'/'skills'/'services' all render HomeComponent
// (scroll-to-section deep links into the single homepage) — SeoService already
// gives them the same canonical as '/', but without prerendering they served
// the empty CSR shell to any crawler/link that hit them directly.
const STATIC_PUBLIC_PAGES = ['homepage', 'projects', 'blog', 'contact', 'testimonials', 'about', 'tech-stack', 'experience', 'skills', 'services', 'privacy-policy', 'cookie-policy'];

// Same API base resolution + pagination + failure fallback as
// scripts/generate-sitemap.js, so a backend outage at build time degrades
// to "no blog slugs prerendered" instead of failing the whole build.
const API_BASE_URL = process.env['SITEMAP_API_URL']
  || process.env['API_BASE_URL']
  || 'https://portfolio-backend-production-e76d.up.railway.app/api/v1';

async function fetchBlogPosts(): Promise<PostSlugs[]> {
  // Prefer the posts scripts/prefetch-blog-posts.js already downloaded before
  // the build — same source the prerendered pages render from, and no extra
  // API traffic. Falls back to the live API when the cache is missing/empty.
  const prefetched = readPrerenderBlogPosts();
  if (prefetched.length) return prefetched;

  const posts: PostSlugs[] = [];
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const res = await fetch(`${API_BASE_URL}/blog/posts?page=${page}&limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      for (const post of json.data ?? []) {
        if (post.slug) posts.push(post);
      }

      totalPages = json.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages);
  } catch (err) {
    console.warn('Could not fetch blog posts for prerendering — skipping blog/:slug:', (err as Error).message);
    return [];
  }

  return posts;
}

export const serverRoutes: ServerRoute[] = [
  ...PUBLIC_TOOL_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  ...STATIC_PUBLIC_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  // /en/homepage, /es/about, /en/lab/pdf-search, ... — one dynamic :lang route
  // per static AND tool page (mirrors app.routes.ts's `:lang` + canMatch
  // structure), each expanding to the 6 non-default languages via
  // getPrerenderParams. Without this, SeoService's hreflang tags (emitted on
  // every /lab/* page too) pointed at URLs that were never actually
  // prerendered under the static deploy — crawlers got the generic shell
  // instead of localized content for every non-Italian tool page.
  ...[...STATIC_PUBLIC_PAGES, ...PUBLIC_TOOL_PAGES].map((page): ServerRoute => ({
    path: `:lang/${page}`,
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return NON_DEFAULT_LANGS.map(lang => ({ lang }));
    },
  })),
  {
    path: 'blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return (await fetchBlogPosts()).map(p => ({ slug: p.slug }));
    },
  },
  // /en/blog/<slug_en>, /sq/blog/<slug_sq>, ... — every published post ×
  // the 6 non-default languages, each under its translated slug. The
  // Italian slug is ALSO prerendered under every language prefix: links
  // like /sq/blog/<italian-slug> were already shared before slugs were
  // translated, and must keep serving real og: tags (their canonical/og:url
  // point at the translated slug).
  {
    path: ':lang/blog/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const posts = await fetchBlogPosts();
      return NON_DEFAULT_LANGS.flatMap(lang => posts.flatMap(p =>
        [...new Set([localizedSlug(p, lang), p.slug])].map(slug => ({ lang, slug })),
      ));
    },
  },
  { path: '**', renderMode: RenderMode.Server },
];
