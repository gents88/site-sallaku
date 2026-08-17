import { Route, Routes } from '@angular/router';
import { adminRoutes } from './features/admin/admin.routes';
import { langCanMatchGuard } from './core/routing/lang-can-match.guard';
import { langResolver } from './core/routing/lang.resolver';

// Shared by both the unprefixed (Italian default) and /:lang-prefixed route
// trees below — same component references, listed once. langResolver on
// each wrapper sets LanguageService/TranslateService to match BEFORE any of
// these children activate, so the prefix actually changes rendered content
// (both for real navigation and Angular's build-time prerenderer), not just
// what SeoService's hreflang tags claim.
const publicPages: Route[] = [
  {
    path: '',
    redirectTo: 'homepage',
    pathMatch: 'full',
  },
  {
    path: 'homepage',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'tech-stack',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'experience',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'skills',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'projects',
    data: { preload: true },
    loadComponent: () =>
      import('./features/projects/projects-list/projects-list.component').then(m => m.ProjectsListComponent),
  },
  {
    path: 'blog',
    data: { preload: true },
    loadComponent: () =>
      import('./features/blog/blog-list/blog-list.component').then(m => m.BlogListComponent),
  },
  {
    path: 'blog/:slug',
    loadComponent: () =>
      import('./features/blog/blog-detail/blog-detail.component').then(m => m.BlogDetailComponent),
  },
  {
    path: 'services',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'testimonials',
    data: { preload: true },
    loadComponent: () =>
      import('./features/testimonials/testimonials.component').then(m => m.TestimonialsComponent),
  },
  {
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact.component').then(m => m.ContactComponent),
  },
];

export const routes: Routes = [
  // ── Public pages, Italian default (unprefixed) ────
  // Pathless grouping route (no matcher, no extra segment consumed) purely
  // to attach the shared resolver — SSR-safe, unlike a UrlMatcher.
  {
    path: '',
    resolve: { lang: langResolver },
    children: publicPages,
  },

  // ── Public pages, /en, /es, /sq, /pt, /fr, /de prefixed ───
  // canMatch rejects any first segment that isn't a recognized non-default
  // lang code (e.g. 'dashboard'), so the router falls through to the routes
  // below untouched — same effect as the old matcher's "consume nothing",
  // but expressed as a literal :lang path segment, which is what Angular's
  // prerenderer actually knows how to cross-reference against
  // app.routes.server.ts.
  {
    path: ':lang',
    canMatch: [langCanMatchGuard],
    resolve: { lang: langResolver },
    children: publicPages,
  },

  // ── Admin: auth pages (public) ───────────────────
  {
    path: 'dashboard/login',
    loadComponent: () =>
      import('./features/admin/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard/login/otp',
    loadComponent: () =>
      import('./features/admin/auth/otp-login/otp-login.component').then(m => m.OtpLoginComponent),
  },
  {
    path: 'dashboard/register',
    loadComponent: () =>
      import('./features/admin/auth/register/register.component').then(m => m.RegisterComponent),
  },

  // ── Admin shell: hosts the sidebar. AI/Tools children below are public;
  // Content-management children (projects/blog/experiences/about) are
  // individually guarded inside adminRoutes ─────────────────────────
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: adminRoutes,
  },

  // ── Fallback ──────────────────────────────────────
  { path: '**', redirectTo: '' },
];
