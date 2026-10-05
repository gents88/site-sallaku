import registry from './nav-registry.json';

/**
 * Registro unico della navigazione.
 *
 * Prima le stesse voci erano duplicate a mano in navbar (navLinks), sidebar
 * (ADMIN_NAV), ricerca (SITE_SEARCH_ENTRIES), prerender (app.routes.server.ts)
 * e sitemap (scripts/generate-sitemap.js) — e si erano già disallineate
 * (/lab/library nella sitemap ma non prerenderizzata, Libreria e I miei file
 * assenti dalla ricerca). Ora ognuno di questi elenchi è derivato da qui; il
 * JSON è letto anche dallo script Node della sitemap, per questo non è un .ts.
 */
export type NavGroupId = 'site' | 'legal' | 'lab' | 'overview' | 'content' | 'ai' | 'workspace' | 'account' | 'tools';
export type NavAccess = 'public' | 'admin';

export interface NavSitemap {
  /** Override del path pubblicato (es. '/' per la home invece di '/homepage'). */
  loc?: string;
  changefreq: string;
  priority: string;
}

export interface NavEntry {
  id: string;
  /** Path logico senza prefisso lingua: i consumer lo passano a `| langUrl`. */
  route: string;
  /** Etichetta corta (navbar/sidebar/palette). */
  labelKey: string;
  /** Titolo più descrittivo per la ricerca, se diverso da labelKey. */
  searchTitleKey?: string;
  descKey?: string;
  group: NavGroupId;
  access: NavAccess;
  /** Nome di un'icona in NAV_ICONS (shared/components/nav-icon). */
  icon: string;
  navbar?: boolean;
  sidebar?: boolean;
  search?: boolean;
  prerender?: boolean;
  /** Id della <section> della homepage a cui la voce fa scroll (scroll-spy navbar). */
  homeSection?: string;
  /**
   * La rotta ha un componente proprio (non HomeComponent) pur avendo una
   * sezione in homepage: resta nello scroll-spy quando si è sulla home, ma
   * visitarla NON è "essere sulla homepage" — trattarla così faceva
   * evidenziare la tab Home su /contact.
   */
  ownPage?: boolean;
  sitemap?: NavSitemap;
}

export interface NavGroup {
  id: NavGroupId;
  titleKey: string;
  items: NavEntry[];
}

export const NAV_REGISTRY: readonly NavEntry[] = registry as NavEntry[];

/** Ordine e titoli dei gruppi della sidebar. */
const SIDEBAR_GROUPS: { id: NavGroupId; titleKey: string }[] = [
  { id: 'overview', titleKey: 'sidebar.groups.overview' },
  { id: 'content', titleKey: 'sidebar.groups.content' },
  { id: 'ai', titleKey: 'sidebar.groups.ai' },
  { id: 'workspace', titleKey: 'sidebar.groups.workspace' },
  { id: 'account', titleKey: 'sidebar.groups.account' },
  { id: 'tools', titleKey: 'sidebar.groups.tools' },
];

export function navbarEntries(): NavEntry[] {
  return NAV_REGISTRY.filter(e => e.navbar);
}

/** Gruppi della sidebar visibili per il ruolo corrente (gli admin vedono anche overview/contenuti). */
export function sidebarGroups(isAdmin: boolean): NavGroup[] {
  return SIDEBAR_GROUPS
    .map(g => ({
      ...g,
      items: NAV_REGISTRY.filter(e => e.sidebar && e.group === g.id && (isAdmin || e.access === 'public')),
    }))
    .filter(g => g.items.length > 0);
}

export function searchableEntries(): NavEntry[] {
  return NAV_REGISTRY.filter(e => e.search && e.access === 'public');
}

/** Pagine da prerenderizzare, come path senza slash iniziale (formato di app.routes.server.ts). */
export function prerenderPaths(): string[] {
  return NAV_REGISTRY.filter(e => e.prerender).map(e => e.route.replace(/^\//, ''));
}

/** Id delle <section> della homepage, nell'ordine del registro. */
export function homeSectionIds(): string[] {
  return NAV_REGISTRY.flatMap(e => (e.homeSection ? [e.homeSection] : []));
}

/** Rotte che renderizzano HomeComponent: home + voci il cui path è solo un'ancora di sezione (es. /about → #about). */
export function homepageRoutes(): Set<string> {
  const routes = new Set(['/', '/homepage']);
  for (const e of NAV_REGISTRY) {
    if (e.homeSection && !e.ownPage) routes.add(e.route);
  }
  return routes;
}
