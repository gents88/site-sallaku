import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ALL_LANGS, Lang, LanguageService } from '../services/language.service';

/**
 * Runs before any component under the langMatcher-wrapped route tree
 * activates — on both real browser navigation and Angular's build-time
 * prerenderer (which waits for pending resolvers before serializing HTML).
 * This is what makes the /en/, /es/... prefix actually change what gets
 * rendered, instead of just what SeoService *claims* via hreflang.
 */
export const langResolver: ResolveFn<Lang> = (route) => {
  const languageService = inject(LanguageService);
  const raw = route.paramMap.get('lang');
  const explicit = !!raw && (ALL_LANGS as string[]).includes(raw);
  const lang: Lang = explicit ? (raw as Lang) : 'it';
  return languageService.setLangFromUrl(lang, explicit);
};
