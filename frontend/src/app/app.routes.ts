import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ── Public pages ──────────────────────────────────
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
    path: 'contact',
    loadComponent: () =>
      import('./features/contact/contact.component').then(m => m.ContactComponent),
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

  // ── AI & Tools: public (no auth required) ─────────
  {
    path: 'dashboard/tools',
    loadComponent: () => import('./features/admin/tools/tools.component').then(m => m.ToolsComponent),
  },
  {
    path: 'dashboard/pdf-summary',
    loadComponent: () => import('./features/admin/pdf-summary/pdf-summary.component').then(m => m.PdfSummaryComponent),
  },
  {
    path: 'dashboard/ai-formatter',
    loadComponent: () => import('./features/admin/ai-formatter/ai-formatter.component').then(m => m.AiFormatterComponent),
  },
  {
    path: 'dashboard/pdf-translate',
    loadComponent: () => import('./features/admin/pdf-translate/pdf-translate.component').then(m => m.PdfTranslateComponent),
  },
  {
    path: 'dashboard/ai-ppt',
    loadComponent: () => import('./features/admin/ai-ppt/ai-ppt.component').then(m => m.AiPptComponent),
  },

  // ── Admin: protected dashboard ────────────────────
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.adminRoutes),
  },

  // ── Fallback ──────────────────────────────────────
  { path: '**', redirectTo: '' },
];
