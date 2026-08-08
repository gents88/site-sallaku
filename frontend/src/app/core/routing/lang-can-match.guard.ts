import { CanMatchFn } from '@angular/router';
import { NON_DEFAULT_LANGS } from '../services/language.service';

/**
 * Restricts the `:lang` parent route (app.routes.ts) to only match when the
 * first URL segment is actually a recognized non-default language code
 * (en, sq, es, pt, fr, de) — everything else (dashboard, unknown segments)
 * falls through to the router's next top-level route entry untouched.
 *
 * Replaced an earlier UrlMatcher-based approach: Angular's build-time
 * prerenderer explicitly refuses to prerender routes with a `matcher`
 * ("Routes with matchers cannot use prerendering"), and more fundamentally
 * its server/client route cross-validation never even descends into a
 * matcher route's children — literal `path` segments (a `:lang` param
 * guarded by CanMatch) are what the prerenderer actually knows how to walk
 * and cross-reference against app.routes.server.ts.
 */
export const langCanMatchGuard: CanMatchFn = (_route, segments) => {
  return segments.length > 0 && (NON_DEFAULT_LANGS as readonly string[]).includes(segments[0].path);
};
