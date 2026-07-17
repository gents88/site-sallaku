import { RenderMode, ServerRoute } from '@angular/ssr';

// Public AI/PDF tool pages under /dashboard — pre-rendered at build time so
// the static FileZilla deploy ships real HTML (title/meta/JSON-LD) for
// crawlers instead of the generic app-shell fallback. See admin.routes.ts
// for the matching Angular route list.
const PUBLIC_TOOL_PAGES = [
  'dashboard/tools',
  'dashboard/pdf-summary',
  'dashboard/ai-formatter',
  'dashboard/pdf-translate',
  'dashboard/ai-ppt',
  'dashboard/convert',
  'dashboard/pdf-editor',
  'dashboard/viewer',
  'dashboard/editor',
  'dashboard/ocr',
  'dashboard/scanner',
];

export const serverRoutes: ServerRoute[] = [
  ...PUBLIC_TOOL_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  { path: '**', renderMode: RenderMode.Server },
];
