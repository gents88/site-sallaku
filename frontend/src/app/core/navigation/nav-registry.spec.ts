import { describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import {
  NAV_REGISTRY, homeSectionIds, homepageRoutes, navbarEntries, prerenderPaths, searchableEntries, sidebarGroups,
} from './nav-registry';
import { NAV_ICONS } from '../../shared/components/nav-icon/nav-icon.component';
import de from '../../../../public/i18n/de.json';
import en from '../../../../public/i18n/en.json';
import es from '../../../../public/i18n/es.json';
import fr from '../../../../public/i18n/fr.json';
import it_ from '../../../../public/i18n/it.json';
import pt from '../../../../public/i18n/pt.json';
import sq from '../../../../public/i18n/sq.json';

const LANGS: Record<string, unknown> = { de, en, es, fr, it: it_, pt, sq };

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
}

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

  it('exposes a short navbar: five sections plus Contatti as the last item (the CTA)', () => {
    expect(navbarEntries().map(e => e.route)).toEqual([
      '/projects', '/services', '/blog', '/lab', '/about', '/contact',
    ]);
  });

  it('keeps the old home anchors reachable from search, out of the navbar', () => {
    const searchable = searchableEntries().map(e => e.route);
    for (const route of ['/tech-stack', '/experience', '/skills', '/testimonials']) {
      expect(searchable).toContain(route);
      expect(navbarEntries().map(e => e.route)).not.toContain(route);
    }
  });

  it('lists /about in the sitemap now that it is a page of its own', () => {
    const about = NAV_REGISTRY.find(e => e.id === 'about')!;
    expect(about.sitemap).toBeDefined();
    expect(about.homeSection).toBeUndefined();
  });

  it('links every parameterless admin page (regression: /dashboard/ai had no link anywhere)', () => {
    const registered = new Set(NAV_REGISTRY.map(e => e.route.replace(/^\//, '')));
    const orphans = [...declaredPaths()].filter(
      p => p.startsWith('dashboard') && !p.includes(':') && !/^dashboard\/(login|register)/.test(p) && !registered.has(p),
    );
    expect(orphans).toEqual([]);
  });

  it('uses only icons that exist in NAV_ICONS (an unknown name renders as a dot)', () => {
    expect(NAV_REGISTRY.filter(e => !Object.prototype.hasOwnProperty.call(NAV_ICONS, e.icon)).map(e => e.id)).toEqual([]);
  });

  it('has every label, title and description in every language', () => {
    const missing: string[] = [];
    for (const [lang, dict] of Object.entries(LANGS)) {
      for (const entry of NAV_REGISTRY) {
        for (const key of [entry.labelKey, entry.searchTitleKey, entry.descKey]) {
          if (key && typeof lookup(dict, key) !== 'string') missing.push(`${lang}:${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('hides overview/content groups from non-admins', () => {
    expect(sidebarGroups(false).map(g => g.id)).toEqual(['ai', 'workspace', 'account', 'tools']);
    expect(sidebarGroups(true).map(g => g.id)).toEqual(['overview', 'content', 'ai', 'workspace', 'account', 'tools']);
  });

  it('treats only HomeComponent routes as the homepage (not /about, /contact, /projects, /testimonials)', () => {
    const home = homepageRoutes();
    expect([...home].sort()).toEqual(['/', '/homepage', '/services']);
    expect(homeSectionIds()).toEqual(expect.arrayContaining(['testimonials', 'projects', 'services']));
    expect(homeSectionIds()).not.toContain('contact');
    expect(homeSectionIds()).not.toContain('about');
  });
});
