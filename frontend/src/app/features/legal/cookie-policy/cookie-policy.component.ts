import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { ConsentService } from '../../../core/services/consent.service';

@Component({
  selector: 'app-cookie-policy',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, LangUrlPipe],
  templateUrl: './cookie-policy.component.html',
  styleUrls: ['./cookie-policy.component.scss'],
})
export class CookiePolicyComponent implements OnInit {
  constructor(
    private seo: SeoService,
    private translate: TranslateService,
    private langService: LanguageService,
    private consent: ConsentService,
  ) {}

  ngOnInit(): void {
    const lang = this.langService.current();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/cookie-policy', lang)}`;
    const title = this.translate.instant('cookie_policy.title');
    const description = this.translate.instant('cookie_policy.meta_description');
    this.seo.update({ title, description, url: pageUrl });
    this.seo.injectJsonLd([
      this.seo.breadcrumb([
        { name: this.translate.instant('nav.home'), url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: title, url: pageUrl },
      ]),
    ]);
  }

  openPreferences(): void {
    this.consent.openPreferences();
  }
}
