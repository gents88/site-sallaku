import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Lang, LanguageService, stripLangPrefix, withLangPrefix } from './language.service';
import { SeoService } from './seo.service';

/**
 * Cambio lingua "come da selettore": naviga alla stessa pagina nella lingua
 * scelta. Condiviso da lang-switcher e palette comandi, così entrambi
 * seguono gli slug tradotti dei post e la persistenza di 'it'.
 */
@Injectable({ providedIn: 'root' })
export class LanguageSwitchService {
  private readonly router = inject(Router);
  private readonly lang = inject(LanguageService);
  private readonly seo = inject(SeoService);

  async switchTo(code: Lang): Promise<void> {
    const currentUrl = this.router.url.split('?')[0];
    if (currentUrl.startsWith('/dashboard')) {
      // /dashboard/** has no lang-prefixed routes — keep the old
      // client-state-only behavior there instead of navigating to a URL
      // the router can't match.
      this.lang.setLang(code);
      return;
    }
    const { basePath } = stripLangPrefix(currentUrl);
    // langResolver (triggered by this navigation) calls setLangFromUrl,
    // which persists the choice and updates TranslateService — no need
    // to also call setLang() here, avoids a double-set race.
    //
    // Exception: switching TO 'it' resolves as explicit=false (no URL
    // prefix), so setLangFromUrl won't persist it — it'll instead see the
    // still-stored old language and bounce the navigation right back.
    // Persist 'it' ourselves before navigating to prevent that.
    if (code === 'it') {
      this.lang.persistChoice('it');
    }
    // Pages with translated paths (blog posts: /blog/<slug_xx>) declare
    // each language's path via SeoService; everything else keeps basePath.
    const targetUrl = withLangPrefix(this.seo.alternatePath(code) ?? basePath, code);
    await this.router.navigateByUrl(targetUrl).catch(() => false);
  }
}
