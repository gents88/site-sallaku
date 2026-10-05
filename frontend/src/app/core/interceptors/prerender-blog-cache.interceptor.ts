import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { of } from 'rxjs';
import { Post } from '../models/post.model';

/**
 * Posts downloaded once before the build by scripts/prefetch-blog-posts.js.
 * Provided ONLY by app.config.server.ts — in the browser the token is absent
 * and the interceptor below is a no-op.
 */
export const PRERENDER_BLOG_POSTS = new InjectionToken<ReadonlyMap<string, Post>>('PRERENDER_BLOG_POSTS');

/** Matches `<anything>/blog/posts/<slug>` (not `/view`, not the admin routes). */
const POST_BY_SLUG = /\/blog\/posts\/([^/?#]+)(?:[?#].*)?$/;

/**
 * During prerendering, answers `GET /blog/posts/:slug` from the prefetched
 * posts instead of letting each of the ~300 post×language routes hit the
 * live API. That burst used to trip the backend throttle and prerender pages
 * as "Post not found" with the site's generic og: tags — the broken
 * Facebook previews. Slugs missing from the cache fall through to the network.
 */
export const prerenderBlogCacheInterceptor: HttpInterceptorFn = (req, next) => {
  const posts = inject(PRERENDER_BLOG_POSTS, { optional: true });
  if (!posts?.size || req.method !== 'GET') return next(req);
  const match = POST_BY_SLUG.exec(req.url);
  const post = match ? posts.get(decodeURIComponent(match[1])) : undefined;
  return post ? of(new HttpResponse({ status: 200, url: req.url, body: post })) : next(req);
};
