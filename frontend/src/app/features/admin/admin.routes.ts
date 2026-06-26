import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./projects-manage/projects-manage.component').then(m => m.ProjectsManageComponent),
  },
  {
    path: 'experiences',
    loadComponent: () =>
      import('./experiences-manage/experiences-manage.component').then(m => m.ExperiencesManageComponent),
  },
  {
    path: 'blog',
    loadComponent: () =>
      import('./blog-manage/blog-manage.component').then(m => m.BlogManageComponent),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./about-manage/about-manage.component').then(m => m.AboutManageComponent),
  },
];
