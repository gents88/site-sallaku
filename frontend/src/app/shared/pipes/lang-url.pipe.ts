import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService, withLangPrefix } from '../../core/services/language.service';

/**
 * Prefixes an internal path with the current language, e.g.
 * `{{ '/about' | langUrl }}` → '/about' on the Italian default, '/en/about'
 * when browsing under /en/. Keeps templates terse and in sync with
 * withLangPrefix instead of every routerLink hardcoding an unprefixed path
 * (which would silently drop the user back to Italian content on click).
 */
@Pipe({ name: 'langUrl', standalone: true, pure: false })
export class LangUrlPipe implements PipeTransform {
  private readonly lang = inject(LanguageService);

  transform(path: string | undefined | null): string {
    if (!path) return '';
    // /dashboard/** is a separate, never-prefixed route tree (admin + public
    // tool pages) — some nav lists conditionally include a dashboard link
    // alongside language-prefixable public links, so guard here rather than
    // at every template call site.
    if (path.startsWith('/dashboard')) return path;
    return withLangPrefix(path, this.lang.current());
  }
}
