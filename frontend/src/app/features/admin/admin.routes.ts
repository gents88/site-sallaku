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
    path: 'about',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./about-manage/about-manage.component').then(m => m.AboutManageComponent),
  },

  // ── AI & Tools: public (no auth required) ─────────────────────────────────
  {
    path: 'tools',
    loadComponent: () => import('./tools/tools.component').then(m => m.ToolsComponent),
  },
  {
    path: 'pdf-summary',
    loadComponent: () => import('./pdf-summary/pdf-summary.component').then(m => m.PdfSummaryComponent),
  },
  {
    path: 'ai-formatter',
    loadComponent: () => import('./ai-formatter/ai-formatter.component').then(m => m.AiFormatterComponent),
  },
  {
    path: 'pdf-translate',
    loadComponent: () => import('./pdf-translate/pdf-translate.component').then(m => m.PdfTranslateComponent),
  },
  {
    path: 'ai-ppt',
    loadComponent: () => import('./ai-ppt/ai-ppt.component').then(m => m.AiPptComponent),
  },
  {
    path: 'convert',
    loadComponent: () => import('./convert/convert.component').then(m => m.ConvertComponent),
  },
  {
    path: 'pdf-editor',
    loadComponent: () => import('./pdf-editor/pdf-editor.component').then(m => m.PdfEditorComponent),
  },
  {
    path: 'viewer',
    loadComponent: () => import('./viewer/viewer.component').then(m => m.ViewerComponent),
  },
  {
    path: 'editor',
    loadComponent: () => import('./editor/editor.component').then(m => m.EditorComponent),
  },
  {
    path: 'ocr',
    loadComponent: () => import('./ocr/ocr.component').then(m => m.OcrComponent),
  },
  {
    path: 'scanner',
    loadComponent: () => import('./scanner/scanner.component').then(m => m.ScannerComponent),
  },
];
