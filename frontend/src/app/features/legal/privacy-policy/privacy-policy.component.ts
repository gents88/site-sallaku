import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';

const SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, LangUrlPipe, BreadcrumbComponent],
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss'],
})
export class PrivacyPolicyComponent implements OnInit {
  readonly sections = SECTION_KEYS;
  breadcrumbItems: BreadcrumbItem[] = [];

  constructor(
    private seo: SeoService,
    private translate: TranslateService,
    private langService: LanguageService,
  ) {}

  ngOnInit(): void {
    const lang = this.langService.current();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/privacy-policy', lang)}`;
    const title = this.translate.instant('privacy.title');
    const description = this.translate.instant('privacy.meta_description');
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
}
