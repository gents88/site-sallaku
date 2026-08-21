import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const adminRoutes: Routes = [
  // ── Admin-only: overview + content management ────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'ai',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./ai-assistant/ai-assistant.component').then(m => m.AiAssistantComponent),
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./projects-manage/projects-manage.component').then(m => m.ProjectsManageComponent),
  },
  {
    path: 'experiences',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./experiences-manage/experiences-manage.component').then(m => m.ExperiencesManageComponent),
  },
  {
    path: 'blog',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./blog-manage/blog-manage.component').then(m => m.BlogManageComponent),
  },
  {
    path: 'blog/preview/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('../blog/blog-detail/blog-detail.component').then(m => m.BlogDetailComponent),
  },
  {
    path: 'notes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./notes-manage/notes-manage.component').then(m => m.NotesManageComponent),
  },
  {
    path: 'testimonials',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./testimonials-manage/testimonials-manage.component').then(m => m.TestimonialsManageComponent),
  },
  {
    path: 'about',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./about-manage/about-manage.component').then(m => m.AboutManageComponent),
  },

  // AI & Tools moved to /lab/* (public, no auth) — see app.routes.ts.
  // Kept out of this admin route tree entirely now that they no longer
  // share the /dashboard/* prefix.
];
