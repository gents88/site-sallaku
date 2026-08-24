import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { ConsentService } from '../../../core/services/consent.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';

@Component({
  selector: 'app-cookie-policy',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, LangUrlPipe, BreadcrumbComponent],
  templateUrl: './cookie-policy.component.html',
  styleUrls: ['./cookie-policy.component.scss'],
})
export class CookiePolicyComponent implements OnInit {
  breadcrumbItems: BreadcrumbItem[] = [];

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
    const homeLabel = this.translate.instant('nav.home');
    this.seo.injectJsonLd([
      this.seo.breadcrumb([
        { name: homeLabel, url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: title, url: pageUrl },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: homeLabel, path: '/' },
      { label: title },
    ];
  }

  openPreferences(): void {
    this.consent.openPreferences();
  }
}
