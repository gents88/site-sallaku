import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SeoService } from '../../core/services/seo.service';
import { LangUrlPipe } from '../../shared/pipes/lang-url.pipe';

/**
 * Pagina "non trovata" della rotta jolly. Apache risponde già 404 agli URL
 * sconosciuti (frontend/public/.htaccess); qui il noindex copre le navigazioni
 * lato client e i casi in cui la risposta è 200 (shell servita da un fallback).
 */
@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink, TranslateModule, LangUrlPipe],
  template: `
    <section class="not-found">
      <div class="container not-found__inner">
        <p class="not-found__code" aria-hidden="true">404</p>
        <h1 class="section-title">{{ 'page_not_found.title' | translate }}</h1>
        <p class="not-found__text">{{ 'page_not_found.text' | translate }}</p>
        <div class="not-found__actions">
          <a class="btn btn-primary" [routerLink]="'/' | langUrl">{{ 'page_not_found.home' | translate }}</a>
          <a class="btn btn-outline" [routerLink]="'/blog' | langUrl">{{ 'page_not_found.blog' | translate }}</a>
          <a class="btn btn-outline" [routerLink]="'/lab' | langUrl">{{ 'page_not_found.lab' | translate }}</a>
        </div>
        <h2 class="not-found__sub">{{ 'page_not_found.popular_tools' | translate }}</h2>
        <ul class="not-found__tools" role="list">
          @for (tool of popularTools; track tool.route) {
            <li><a [routerLink]="tool.route | langUrl">{{ tool.key | translate }}</a></li>
          }
        </ul>
      </div>
    </section>
  `,
  styles: [`
    .not-found { padding: 140px 0 100px; text-align: center; }
    .not-found__inner { max-width: 640px; }
    .not-found__code { font-size: 4rem; font-weight: 800; line-height: 1; margin: 0 0 12px; color: var(--text-muted); }
    .not-found__text { color: var(--text-secondary); margin: 12px 0 32px; }
    .not-found__sub { margin: 40px 0 12px; font-size: 1rem; color: var(--text-secondary); font-weight: 600; }
    .not-found__tools { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 0; padding: 0; list-style: none; }
    .not-found__tools a { display: inline-block; padding: 8px 14px; min-height: 40px; border: 1px solid var(--border-subtle, rgba(148,163,184,.3)); border-radius: 999px; color: var(--text-primary); text-decoration: none; }
    .not-found__tools a:hover, .not-found__tools a:focus-visible { border-color: var(--primary-400, #818cf8); }
    .not-found__actions { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  `],
})
export class NotFoundComponent implements OnInit {
  /** Gli strumenti più usati: chi arriva su un link rotto ha comunque dove andare. */
  readonly popularTools = [
    { route: '/lab/pdf-search', key: 'sidebar.items.pdf_search' },
    { route: '/lab/convert', key: 'sidebar.items.convert' },
    { route: '/lab/image-tools', key: 'sidebar.items.image_tools' },
    { route: '/lab/qr-code', key: 'sidebar.items.qr_code' },
    { route: '/lab/compress-pdf', key: 'sidebar.items.compress_pdf' },
    { route: '/lab/sign-pdf', key: 'sidebar.items.sign_pdf' },
  ];

  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    // get() aspetta le traduzioni se non sono ancora arrivate: questa rotta non
    // passa dal resolver della lingua come le pagine pubbliche.
    this.translate.get('page_not_found.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(title => this.seo.update({ title, noindex: true }));
  }
}
