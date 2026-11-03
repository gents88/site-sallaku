import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SearchHit } from './search.service';
import { searchableEntries } from '../navigation/nav-registry';
import { TestimonialsService } from './testimonials.service';

/** Client-side match contro le voci `search` del registro di navigazione — instant, no network round-trip, always current-language via TranslateService. */
@Injectable({ providedIn: 'root' })
export class SiteSearchService {
  private readonly translate = inject(TranslateService);
  /** Come nel menu: Testimonianze non compare finché non ce n'è almeno una pubblicata. */
  private readonly hasTestimonials = inject(TestimonialsService).hasPublic();

  search(query: string): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const entries = searchableEntries().filter(e => e.id !== 'testimonials' || this.hasTestimonials());
    return entries.reduce<SearchHit[]>((hits, entry) => {
      const title = this.translate.instant(entry.searchTitleKey ?? entry.labelKey) as string;
      const excerpt = entry.descKey ? (this.translate.instant(entry.descKey) as string) : '';
      const matches = title.toLowerCase().includes(q) || excerpt.toLowerCase().includes(q) || entry.route.toLowerCase().includes(q);
      if (matches) {
        hits.push({ id: `page:${entry.route}`, type: 'page', title, excerpt, url: entry.route, tags: [], updatedAt: '' });
      }
      return hits;
    }, []);
  }
}
