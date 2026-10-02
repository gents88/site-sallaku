import { readFileSync } from 'fs';
import { join } from 'path';
import { Post, localizedSlug } from './core/models/post.model';
import { NON_DEFAULT_LANGS } from './core/services/language.service';

/**
 * SERVER-ONLY. Reads the posts scripts/prefetch-blog-posts.js saved before the
 * build. Resolved from process.cwd() (= frontend/) for the same reason as the
 * i18n loader in app.config.server.ts: prerendering runs the server bundle
 * from a temp dir, so import.meta.url-relative paths don't work.
 * Read once per worker; returns [] when the file is missing (e.g. `ng serve`).
 */
let cache: Post[] | null = null;

export function readPrerenderBlogPosts(): Post[] {
  if (cache) return cache;
  try {
    const file = join(process.cwd(), '.prerender-cache', 'blog-posts.json');
    cache = (JSON.parse(readFileSync(file, 'utf-8')).posts ?? []) as Post[];
  } catch {
    cache = [];
  }
  return cache;
}

/** Every distinct URL slug of a post (Italian + translated), for cache lookups. */
export function allSlugs(post: Post): string[] {
  return [...new Set([post.slug, ...NON_DEFAULT_LANGS.map(lang => localizedSlug(post, lang))])];
}
