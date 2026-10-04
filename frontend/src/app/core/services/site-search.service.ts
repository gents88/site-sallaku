import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SearchHit } from './search.service';
import { searchableEntries } from '../navigation/nav-registry';

/** Client-side match contro le voci `search` del registro di navigazione — instant, no network round-trip, always current-language via TranslateService. */
@Injectable({ providedIn: 'root' })
export class SiteSearchService {
  private readonly translate = inject(TranslateService);

  search(query: string): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    return searchableEntries().reduce<SearchHit[]>((hits, entry) => {
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
