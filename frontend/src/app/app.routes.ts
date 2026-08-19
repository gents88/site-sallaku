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
  {
    path: 'search',
    loadComponent: () =>
      import('./features/search/search-results/search-results.component').then(m => m.SearchResultsComponent),
  },

  // ── Lab: public AI/PDF tools ──────────────────────
  // Moved out from under /dashboard/* (2026-08) — these never required auth,
  // sharing the admin prefix was purely historical. Component files still
  // live under features/admin/<tool>/ (not moved, only the route changed);
  // old /dashboard/<tool> URLs 301-redirect here via frontend/public/.htaccess.
  {
    path: 'lab',
    loadComponent: () => import('./features/admin/tools/tools.component').then(m => m.ToolsComponent),
  },
  {
    path: 'lab/pdf-summary',
    loadComponent: () => import('./features/admin/pdf-summary/pdf-summary.component').then(m => m.PdfSummaryComponent),
  },
  {
    path: 'lab/ai-formatter',
    loadComponent: () => import('./features/admin/ai-formatter/ai-formatter.component').then(m => m.AiFormatterComponent),
  },
  {
    path: 'lab/pdf-translate',
    loadComponent: () => import('./features/admin/pdf-translate/pdf-translate.component').then(m => m.PdfTranslateComponent),
  },
  {
    path: 'lab/ai-ppt',
    loadComponent: () => import('./features/admin/ai-ppt/ai-ppt.component').then(m => m.AiPptComponent),
  },
  {
    path: 'lab/convert',
    loadComponent: () => import('./features/admin/convert/convert.component').then(m => m.ConvertComponent),
  },
  {
    path: 'lab/pdf-editor',
    loadComponent: () => import('./features/admin/pdf-editor/pdf-editor.component').then(m => m.PdfEditorComponent),
  },
  {
    path: 'lab/viewer',
    loadComponent: () => import('./features/admin/viewer/viewer.component').then(m => m.ViewerComponent),
  },
  {
    path: 'lab/editor',
    loadComponent: () => import('./features/admin/editor/editor.component').then(m => m.EditorComponent),
  },
  {
    path: 'lab/ocr',
    loadComponent: () => import('./features/admin/ocr/ocr.component').then(m => m.OcrComponent),
  },
  {
    path: 'lab/scanner',
    loadComponent: () => import('./features/admin/scanner/scanner.component').then(m => m.ScannerComponent),
  },
  {
    path: 'lab/workspace',
    loadComponent: () => import('./features/admin/workspace/workspace.component').then(m => m.WorkspaceComponent),
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

  // ── Admin shell: hosts the sidebar. All children (projects/blog/
  // experiences/about/notes/testimonials) are guarded inside adminRoutes —
  // the public AI/Tools pages that used to live here moved to /lab/* above.
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: adminRoutes,
  },

  // ── Fallback ──────────────────────────────────────
  { path: '**', redirectTo: '' },
];
