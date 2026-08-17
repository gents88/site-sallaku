const requested = new Map<string, Promise<void>>();

/**
 * Injects a <link rel="stylesheet"> once per href.
 *
 * Used for the vendor stylesheets that are deliberately kept out of the
 * global bundle (see scripts/copy-vendor-css.js): the Angular Material theme,
 * which only the admin area and the contact page's snackbar need, and Prism's
 * theme, which only blog/:slug needs. Loading them here instead of in
 * angular.json keeps ~110KB of render-blocking CSS off every public page.
 *
 * No-op during SSR/prerender — the server-rendered markup doesn't need the
 * stylesheet, and the browser loads it on hydration when the route that
 * wants it actually activates.
 *
 * Never rejects: a stylesheet that fails to load should degrade the look of
 * one route, not break navigation into it.
 */
export function loadStylesheetOnce(href: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();

  const existing = requested.get(href);
  if (existing) return existing;

  const pending = new Promise<void>((resolve) => {
    // Defensive: another bootstrap path (or a prerendered <link>) may already
    // have this exact stylesheet in the document.
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });

  requested.set(href, pending);
  return pending;
}
