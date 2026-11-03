import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';

const SECTION_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 's12'];

/** Termini d'uso del sito: blog, strumenti del Lab, account e contenuti inviati. Stessa impaginazione della Privacy Policy. */
@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslateModule, RouterLink, LangUrlPipe, BreadcrumbComponent],
  templateUrl: './terms.component.html',
  styleUrls: ['../privacy-policy/privacy-policy.component.scss'],
})
export class TermsComponent implements OnInit {
  readonly sections = SECTION_KEYS;
  breadcrumbItems: BreadcrumbItem[] = [];

  constructor(
    private seo: SeoService,
    private translate: TranslateService,
    private langService: LanguageService,
  ) {}

  ngOnInit(): void {
    const lang = this.langService.current();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/terms', lang)}`;
    const title = this.translate.instant('terms.title');
    const description = this.translate.instant('terms.meta_description');
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
