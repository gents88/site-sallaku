import { RenderMode, ServerRoute } from '@angular/ssr';
import { NON_DEFAULT_LANGS } from './core/services/language.service';
import { readPrerenderBlogPosts } from './prerender-blog-posts';
import { Post, localizedSlug } from './core/models/post.model';
import { prerenderPaths } from './core/navigation/nav-registry';

type PostSlugs = Pick<Post, 'slug' | 'slug_en' | 'slug_sq' | 'slug_pt' | 'slug_es' | 'slug_fr' | 'slug_de'>;

// Pagine statiche e strumenti /lab da prerenderizzare: derivate dal registro
// unico (core/navigation/nav-registry.json, flag `prerender`). Sotto il deploy
// statico FileZilla una pagina non prerenderizzata serve la shell CSR generica
// senza title/meta/JSON-LD — era il caso di /lab/library, presente in sitemap
// ma assente dalla vecchia lista scritta a mano. 'homepage' (non '') perché il
// prerenderer salta le rotte con `redirectTo`; la root `/` è servita da
// homepage/index.html tramite rewrite in .htaccess. Le vecchie URL
// /dashboard/<tool> fanno 301 verso /lab/* (frontend/public/.htaccess).
const PRERENDER_PAGES = prerenderPaths();

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

/** Slug dei progetti con case study, per prerenderizzare /projects/:slug. Stesso fallback del blog: API giù → nessuna pagina, non build fallita. */
async function fetchProjectSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/projects`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const projects = (await res.json()) as Array<{ slug?: string; problem?: string; solution?: string; results?: string }>;
    return projects
      .filter(p => p.slug && (p.problem?.trim() || p.solution?.trim() || p.results?.trim()))
      .map(p => p.slug as string);
  } catch (err) {
    console.warn('Could not fetch projects for prerendering — skipping projects/:slug:', (err as Error).message);
    return [];
  }
}

export const serverRoutes: ServerRoute[] = [
  ...PRERENDER_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  // /en/homepage, /es/about, /en/lab/pdf-search, ... — one dynamic :lang route
  // per static AND tool page (mirrors app.routes.ts's `:lang` + canMatch
  // structure), each expanding to the 6 non-default languages via
  // getPrerenderParams. Without this, SeoService's hreflang tags (emitted on
  // every /lab/* page too) pointed at URLs that were never actually
  // prerendered under the static deploy — crawlers got the generic shell
  // instead of localized content for every non-Italian tool page.
  ...PRERENDER_PAGES.map((page): ServerRoute => ({
    path: `:lang/${page}`,
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return NON_DEFAULT_LANGS.map(lang => ({ lang }));
    },
  })),
  {
    path: 'projects/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      return (await fetchProjectSlugs()).map(slug => ({ slug }));
    },
  },
  {
    path: ':lang/projects/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const slugs = await fetchProjectSlugs();
      return NON_DEFAULT_LANGS.flatMap(lang => slugs.map(slug => ({ lang, slug })));
    },
  },
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
