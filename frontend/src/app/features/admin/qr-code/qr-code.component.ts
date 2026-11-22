import {
  Component, ChangeDetectionStrategy, OnDestroy, OnInit, PLATFORM_ID, inject, signal, computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import qrcode from 'qrcode-generator';
import { SeoService, SITE_ORIGIN } from '../../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { BreadcrumbComponent, BreadcrumbItem } from '../../../shared/components/breadcrumb/breadcrumb.component';
import { LabToolInfoComponent } from '../../../shared/components/lab-tool-info/lab-tool-info.component';
import { LabInfoService } from '../../../shared/components/lab-tool-info/lab-info.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import {
  EcLevel, QR_TYPES, QrType, WifiSecurity, buildPayload, isValidHex, modulesToSvg, pngSizeFor, scanWarning,
} from './qr-code.utils';

// Il testo viene codificato in UTF-8: la conversione predefinita della libreria perde accenti, emoji e simboli.
qrcode.stringToBytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

interface QrMatrix {
  count: number;
  isDark: (row: number, col: number) => boolean;
}

const PNG_SIZES = [512, 1024, 2048, 4096] as const;

@Component({
  selector: 'app-qr-code',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LabToolInfoComponent, TranslateModule, BreadcrumbComponent],
  templateUrl: './qr-code.component.html',
  styleUrls: ['./qr-code.component.scss'],
})
export class QrCodeComponent implements OnInit, OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly labInfo = inject(LabInfoService);
  private readonly langService = inject(LanguageService);
  private readonly t = inject(TranslateService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly page = this.labInfo.page('qr-code');
  breadcrumbItems: BreadcrumbItem[] = [];

  readonly types = QR_TYPES;
  readonly icons: Readonly<Record<QrType, string>> = { url: '🔗', text: '📝', wifi: '📶', contact: '👤', email: '✉️', phone: '📞', whatsapp: '💬' };
  readonly pngSizes = PNG_SIZES;
  readonly ecLevels: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

  readonly type = signal<QrType>('url');
  readonly fields = signal<Record<string, string>>({ security: 'WPA' });
  readonly ec = signal<EcLevel>('M');
  readonly margin = signal(4);
  readonly fg = signal('#000000');
  readonly bg = signal('#ffffff');
  readonly pngSize = signal<number>(1024);
  readonly copied = signal(false);
  readonly sent = signal(false);
  readonly canCopyImage = signal(false);

  readonly payload = computed(() => buildPayload(this.type(), this.fields()));

  /** Matrice dei moduli, oppure l'errore ("troppo lungo") — mai un'eccezione verso il template. */
  readonly built = computed<{ matrix: QrMatrix | null; tooLong: boolean }>(() => {
    const data = this.payload();
    if (!data) return { matrix: null, tooLong: false };
    try {
      const qr = qrcode(0, this.ec());
      qr.addData(data, 'Byte');
      qr.make();
      return { matrix: { count: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) }, tooLong: false };
    } catch {
      return { matrix: null, tooLong: true };
    }
  });

  readonly colorsOk = computed(() => isValidHex(this.fg()) && isValidHex(this.bg()));
  readonly warning = computed(() => scanWarning(this.fg(), this.bg()));
  readonly modules = computed(() => this.built().matrix?.count ?? 0);

  readonly svg = computed(() => {
    const m = this.built().matrix;
    if (!m || !this.colorsOk()) return '';
    return modulesToSvg(m.isDark, m.count, { margin: this.margin(), fg: this.fg(), bg: this.bg(), title: this.t.instant('qr_code.alt') });
  });

  readonly previewUrl = computed<SafeUrl | null>(() => {
    const svg = this.svg();
    return svg ? this.sanitizer.bypassSecurityTrustUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`) : null;
  });

  readonly pngInfo = computed(() => {
    const m = this.built().matrix;
    return m ? pngSizeFor(m.count, this.margin(), this.pngSize()) : null;
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.canCopyImage.set(typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write);
    }
    this.seo.update({
      title: this.t.instant(this.page.titleKey),
      description: this.t.instant(this.page.descriptionKey),
      url: `${SITE_ORIGIN}${withLangPrefix(this.page.path, this.langService.current())}`,
    });
    this.seo.injectJsonLd([
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        featureList: ['Link, Wi-Fi, contact, email and WhatsApp QR codes', 'PNG and SVG download', 'Custom colours', 'Works in the browser, no upload'],
        provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
        ...this.labInfo.appFields(this.page.id),
      },
      ...this.labInfo.faqSchemas(this.page.id),
      this.seo.breadcrumb([
        { name: this.t.instant('nav.home'), url: 'https://gentsallaku.it/' },
        { name: this.t.instant('sidebar.lab'), url: 'https://gentsallaku.it/lab' },
        { name: this.t.instant(this.page.labelKey), url: `${SITE_ORIGIN}${withLangPrefix(this.page.path, this.langService.current())}` },
      ]),
    ]);
    this.breadcrumbItems = [
      { label: this.t.instant('nav.home'), path: '/' },
      { label: this.t.instant('sidebar.lab'), path: '/lab' },
      { label: this.t.instant(this.page.labelKey) },
    ];
  }

  ngOnDestroy(): void { /* nessuna risorsa da liberare: l'anteprima è un data URL */ }

  // ── Dati ──────────────────────────────────────────────────────
  setType(type: QrType): void {
    this.type.set(type);
  }

  field(key: string): string {
    return this.fields()[key] ?? '';
  }

  setField(key: string, value: string): void {
    this.fields.update((f) => ({ ...f, [key]: value }));
  }

  setSecurity(value: string): void {
    this.setField('security', value as WifiSecurity);
  }

  setHidden(checked: boolean): void {
    this.setField('hidden', checked ? 'true' : '');
  }

  // ── Opzioni ───────────────────────────────────────────────────
  setEc(level: EcLevel): void { this.ec.set(level); }
  setMargin(value: string): void { this.margin.set(Math.min(10, Math.max(0, Math.round(Number(value) || 0)))); }
  setFg(value: string): void { this.fg.set(value); }
  setBg(value: string): void { this.bg.set(value); }
  setPngSize(value: string): void { this.pngSize.set(Number(value)); }

  swapColors(): void {
    const f = this.fg();
    this.fg.set(this.bg());
    this.bg.set(f);
  }

  resetColors(): void {
    this.fg.set('#000000');
    this.bg.set('#ffffff');
  }

  // ── Uscita ────────────────────────────────────────────────────
  /** PNG con moduli di pixel interi: nitido e leggibile anche se ingrandito o stampato. */
  private async renderPng(): Promise<Blob | null> {
    const m = this.built().matrix;
    const info = this.pngInfo();
    if (!m || !info || !this.colorsOk()) return null;
    const canvas = document.createElement('canvas');
    canvas.width = info.side;
    canvas.height = info.side;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.bg();
    ctx.fillRect(0, 0, info.side, info.side);
    ctx.fillStyle = this.fg();
    const off = this.margin() * info.module;
    for (let r = 0; r < m.count; r++) {
      for (let c = 0; c < m.count; c++) {
        if (m.isDark(r, c)) ctx.fillRect(off + c * info.module, off + r * info.module, info.module, info.module);
      }
    }
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  }

  async downloadPng(): Promise<void> {
    const blob = await this.renderPng();
    if (!blob) return;
    this.save(blob, `qr-${this.type()}.png`);
    this.analytics.trackClick('qr_code_download', `png:${this.type()}`);
  }

  downloadSvg(): void {
    const svg = this.svg();
    if (!svg) return;
    this.save(new Blob([svg], { type: 'image/svg+xml' }), `qr-${this.type()}.svg`);
    this.analytics.trackClick('qr_code_download', `svg:${this.type()}`);
  }

  async copyImage(): Promise<void> {
    const blob = await this.renderPng();
    if (!blob || !this.canCopyImage()) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    } catch { /* permessi negati: nessun falso "Copiato" */ }
  }

  async sendToWorkspace(): Promise<void> {
    const blob = await this.renderPng();
    if (!blob) return;
    this.workspace.send({ kind: 'file', blob, filename: `qr-${this.type()}.png`, mime: 'image/png', fromTool: 'qr_code' });
    this.sent.set(true);
    setTimeout(() => this.sent.set(false), 1500);
  }

  private save(blob: Blob, name: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    // Revoca differita: Safari/iOS avvia il download in modo asincrono.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}
