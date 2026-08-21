import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SearchHit } from './search.service';

interface SiteSearchEntry {
  titleKey: string;
  descKey?: string;
  route: string;
}

/**
 * Static index of navigable site sections (main nav + /lab tools) — kept in
 * sync by hand with navbar.component.ts's navLinks and tools.component.ts's
 * aiCards/toolCards. Small and stable enough that duplicating it here beats
 * coupling the search feature to those components' internals.
 */
const SITE_SEARCH_ENTRIES: SiteSearchEntry[] = [
  { titleKey: 'nav.about', route: '/about' },
  { titleKey: 'nav.tech', route: '/tech-stack' },
  { titleKey: 'nav.projects', route: '/projects' },
  { titleKey: 'nav.services', route: '/services' },
  { titleKey: 'nav.experience', route: '/experience' },
  { titleKey: 'nav.skills', route: '/skills' },
  { titleKey: 'nav.contact', route: '/contact' },
  { titleKey: 'nav.blog', route: '/blog' },
  { titleKey: 'nav.testimonials', route: '/testimonials' },
  { titleKey: 'nav.ai_tools', route: '/lab' },

  { titleKey: 'tools.pdf_search_title', descKey: 'tools.pdf_search_desc', route: '/lab/pdf-search' },
  { titleKey: 'tools.pdf_summary_title', descKey: 'tools.pdf_summary_desc', route: '/lab/pdf-summary' },
  { titleKey: 'tools.ai_formatter_title', descKey: 'tools.ai_formatter_desc', route: '/lab/ai-formatter' },
  { titleKey: 'tools.pdf_translate_title', descKey: 'tools.pdf_translate_desc', route: '/lab/pdf-translate' },
  { titleKey: 'tools.ai_slides_title', descKey: 'tools.ai_slides_desc', route: '/lab/ai-ppt' },
  { titleKey: 'tools.pdf_editor_title', descKey: 'tools.pdf_editor_desc', route: '/lab/pdf-editor' },
  { titleKey: 'tools.viewer_title', descKey: 'tools.viewer_desc', route: '/lab/viewer' },
  { titleKey: 'tools.editor_title', descKey: 'tools.editor_desc', route: '/lab/editor' },
  { titleKey: 'tools.convert_title', descKey: 'tools.convert_desc', route: '/lab/convert' },
  { titleKey: 'tools.ocr_title', descKey: 'tools.ocr_desc', route: '/lab/ocr' },
  { titleKey: 'tools.scanner_title', descKey: 'tools.scanner_desc', route: '/lab/scanner' },
  { titleKey: 'workspace.title', descKey: 'workspace.subtitle', route: '/lab/workspace' },
];

/** Client-side match against SITE_SEARCH_ENTRIES — instant, no network round-trip, always current-language via TranslateService. */
@Injectable({ providedIn: 'root' })
export class SiteSearchService {
  private readonly translate = inject(TranslateService);

  search(query: string): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    return SITE_SEARCH_ENTRIES.reduce<SearchHit[]>((hits, entry) => {
      const title = this.translate.instant(entry.titleKey) as string;
      const excerpt = entry.descKey ? (this.translate.instant(entry.descKey) as string) : '';
      const matches = title.toLowerCase().includes(q) || excerpt.toLowerCase().includes(q) || entry.route.toLowerCase().includes(q);
      if (matches) {
        hits.push({ id: `page:${entry.route}`, type: 'page', title, excerpt, url: entry.route, tags: [], updatedAt: '' });
      }
      return hits;
    }, []);
  }
}
