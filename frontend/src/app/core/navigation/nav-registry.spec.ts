import { describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import {
  NAV_REGISTRY, homeSectionIds, homepageRoutes, navbarEntries, prerenderPaths, searchableEntries, sidebarGroups,
} from './nav-registry';

/** Tutti i path dichiarati in app.routes.ts, con prefisso dei genitori (es. 'dashboard/projects'). */
function declaredPaths(): Set<string> {
  const out = new Set<string>();
  const walk = (list: typeof routes, prefix: string) => {
    for (const r of list) {
      if (r.path === undefined || r.path.startsWith(':lang')) {
        if (r.children) walk(r.children, prefix);
        continue;
      }
      const full = [prefix, r.path].filter(Boolean).join('/');
      out.add(full);
      if (r.children) walk(r.children, full);
    }
  };
  walk(routes, '');
  return out;
}

describe('NAV_REGISTRY', () => {
  it('has unique ids and routes', () => {
    expect(new Set(NAV_REGISTRY.map(e => e.id)).size).toBe(NAV_REGISTRY.length);
    expect(new Set(NAV_REGISTRY.map(e => e.route)).size).toBe(NAV_REGISTRY.length);
  });

  it('only points at routes that exist in app.routes.ts', () => {
    const declared = declaredPaths();
    const missing = NAV_REGISTRY.map(e => e.route.replace(/^\//, '')).filter(p => !declared.has(p));
    expect(missing).toEqual([]);
  });

  it('never prerenders or exposes in public search an admin-only page', () => {
    const leaks = NAV_REGISTRY.filter(e => e.access === 'admin' && (e.prerender || e.sitemap || e.search));
    expect(leaks).toEqual([]);
  });

  it('prerenders every page it lists in the sitemap (regression: /lab/library was in the sitemap only)', () => {
    const notPrerendered = NAV_REGISTRY.filter(e => e.sitemap && !e.prerender).map(e => e.id);
    expect(notPrerendered).toEqual([]);
    expect(prerenderPaths()).toContain('lab/library');
  });

  it('includes Library and My files in the site search (regression)', () => {
    const ids = searchableEntries().map(e => e.id);
    expect(ids).toEqual(expect.arrayContaining(['library', 'my-files']));
  });

  it('exposes the navbar links in their historical order', () => {
    expect(navbarEntries().map(e => e.route)).toEqual([
      '/about', '/tech-stack', '/projects', '/services', '/experience', '/skills', '/contact', '/blog', '/testimonials',
    ]);
  });

  it('hides overview/content groups from non-admins', () => {
    expect(sidebarGroups(false).map(g => g.id)).toEqual(['ai', 'workspace', 'account', 'tools']);
    expect(sidebarGroups(true).map(g => g.id)).toEqual(['overview', 'content', 'ai', 'workspace', 'account', 'tools']);
  });

  it('treats only HomeComponent routes as the homepage (not /contact, /projects, /testimonials)', () => {
    const home = homepageRoutes();
    expect([...home].sort()).toEqual(['/', '/about', '/experience', '/homepage', '/services', '/skills', '/tech-stack']);
    expect(homeSectionIds()).toEqual(expect.arrayContaining(['testimonials', 'contact', 'projects']));
  });
});
