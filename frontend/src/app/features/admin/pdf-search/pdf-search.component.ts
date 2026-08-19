import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, HostListener, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SeoService } from '../../../core/services/seo.service';
import { PdfSearchService, PdfSearchResult } from '../../../core/services/pdf-search.service';

@Component({
  selector: 'app-pdf-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './pdf-search.component.html',
  styleUrls: ['./pdf-search.component.scss'],
})
export class PdfSearchComponent implements OnInit, OnDestroy {
  private readonly service = inject(PdfSearchService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);

  readonly loading = this.service.isLoading;

  readonly query = signal('');
  readonly results = signal<PdfSearchResult[]>([]);
  readonly error = signal('');
  readonly hasSearched = signal(false);
  readonly selected = signal<PdfSearchResult | null>(null);

  readonly features = [
    { icon: '⚖️', titleKey: 'pdf_search.feature_legal_title', descKey: 'pdf_search.feature_legal_desc' },
    { icon: '📚', titleKey: 'pdf_search.feature_sources_title', descKey: 'pdf_search.feature_sources_desc' },
    { icon: '👁️', titleKey: 'pdf_search.feature_preview_title', descKey: 'pdf_search.feature_preview_desc' },
  ];

  private _previewBlobUrl: string | null = null;
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewLoading = signal(false);

  ngOnInit(): void {
    this.seo.update({
      title: 'Ricerca PDF Pubblico Dominio — Libri e Documenti Legali',
      description: 'Cerca PDF gratuiti e legali tra milioni di libri di pubblico dominio e opere open access su Internet Archive, con anteprima prima del download.',
      url: 'https://gentsallaku.it/lab/pdf-search',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Ricerca PDF',
      description: 'Ricerca di PDF di pubblico dominio e open access su Internet Archive, con anteprima integrata.',
      url: 'https://gentsallaku.it/lab/pdf-search',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  ngOnDestroy(): void {
    this._revokePreview();
  }

  private _revokePreview(): void {
    // pdfUrl points at the external source, not a local blob — nothing to revoke,
    // just clear the sanitized reference so a stale iframe never lingers.
    this._previewBlobUrl = null;
    this.previewUrl.set(null);
  }

  search(): void {
    const q = this.query().trim();
    if (q.length < 2) return;
    this.error.set('');
    this.hasSearched.set(true);
    this.selected.set(null);
    this._revokePreview();

    this.service.search(q).subscribe({
      next: (results) => this.results.set(results),
      error: (err) => {
        const msg = err?.error?.message ?? 'La ricerca non è riuscita. Riprova.';
        this.error.set(msg);
        this.results.set([]);
      },
    });
  }

  select(result: PdfSearchResult): void {
    this.selected.set(result);
    this.previewLoading.set(true);
    this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(result.pdfUrl));
  }

  onPreviewLoaded(): void {
    this.previewLoading.set(false);
  }

  closePreview(): void {
    this.selected.set(null);
    this.previewLoading.set(false);
    this._revokePreview();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.selected()) this.closePreview();
  }
}
