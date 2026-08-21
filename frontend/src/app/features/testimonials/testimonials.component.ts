import {
  Component,
  OnInit,
  AfterViewInit,
  ElementRef,
  inject,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TestimonialsService } from '../../core/services/testimonials.service';
import { Testimonial } from '../../core/models/testimonial.model';
import { SnackbarService } from '../../core/services/snackbar.service';
import { SeoService, SITE_ORIGIN } from '../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../core/services/language.service';
import { RatingStarsComponent } from '../../shared/components/rating-stars/rating-stars.component';
import { TurnstileWidgetComponent } from '../../shared/components/turnstile-widget/turnstile-widget.component';

const DATE_LOCALES: Record<string, string> = {
  it: 'it-IT',
  en: 'en-US',
  sq: 'sq-AL',
  pt: 'pt-PT',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, RatingStarsComponent, TurnstileWidgetComponent],
  templateUrl: './testimonials.component.html',
  styleUrls: ['./testimonials.component.scss'],
})
export class TestimonialsComponent implements OnInit, AfterViewInit {
  private readonly platformId = inject(PLATFORM_ID);

  form = this.fb.group({
    authorName: ['', [Validators.required, Validators.maxLength(100)]],
    role: ['', [Validators.maxLength(150)]],
    companyUrl: ['', [Validators.maxLength(500)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    rating: [0, [Validators.required, Validators.min(1), Validators.max(5)]],
    content: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(600)]],
    website: [''],
    honeypot: [''],
  });

  testimonials = signal<Testimonial[]>([]);
  loading = signal(true);
  submitting = signal(false);
  submitted = signal(false);
  turnstileToken = signal('');

  constructor(
    private fb: FormBuilder,
    private el: ElementRef,
    private testimonialsService: TestimonialsService,
    private snackbar: SnackbarService,
    private translate: TranslateService,
    private seo: SeoService,
    private langService: LanguageService,
  ) {}

  ngOnInit(): void {
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/testimonials', this.langService.current())}`;
    this.seo.update({
      title: this.translate.instant('testimonials.title'),
      description: this.translate.instant('testimonials.subtitle'),
      url: pageUrl,
    });

    this.load();
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.12 },
    );
    this.el.nativeElement.querySelectorAll('.reveal').forEach((el: Element) => observer.observe(el));
  }

  private load(): void {
    this.loading.set(true);
    this.testimonialsService.list(50, 0).subscribe({
      next: (res) => {
        this.testimonials.set(res.data);
        this.loading.set(false);
        this.injectStructuredData(res.data);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private injectStructuredData(testimonials: Testimonial[]): void {
    const lang = this.langService.current();
    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/testimonials', lang)}`;
    const title = this.translate.instant('testimonials.title');
    const nodes: object[] = [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        url: pageUrl,
        name: title,
        description: this.translate.instant('testimonials.subtitle'),
      },
      this.seo.breadcrumb([
        { name: this.translate.instant('nav.home'), url: `${SITE_ORIGIN}${withLangPrefix('/', lang)}` },
        { name: title, url: pageUrl },
      ]),
      ...testimonials.map((t) => ({
        '@context': 'https://schema.org',
        '@type': 'Review',
        itemReviewed: { '@type': 'Person', '@id': `${SITE_ORIGIN}/#person` },
        author: { '@type': 'Person', name: t.authorName },
        reviewRating: { '@type': 'Rating', ratingValue: t.rating, bestRating: 5 },
        reviewBody: t.content,
      })),
    ];
    this.seo.injectJsonLd(nodes);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const v = this.form.value;
    this.testimonialsService
      .create({
        authorName: (v.authorName ?? '').trim(),
        role: v.role || undefined,
        companyUrl: v.companyUrl || undefined,
        email: v.email || undefined,
        rating: v.rating ?? 0,
        content: (v.content ?? '').trim(),
        website: v.website || undefined,
        honeypot: v.honeypot || undefined,
        turnstileToken: this.turnstileToken() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitted.set(true);
          this.form.reset({ rating: 0 });
          this.snackbar.show(this.translate.instant('testimonials.form.success'), 'success');
        },
        error: (error) => {
          this.submitting.set(false);
          const message = error.error?.message || this.translate.instant('testimonials.form.error_generic');
          this.snackbar.show(message, 'error');
        },
      });
  }

  onTurnstileVerified(token: string): void {
    this.turnstileToken.set(token);
  }

  setRating(value: number): void {
    this.form.get('rating')?.setValue(value);
    this.form.get('rating')?.markAsTouched();
  }

  getErrorMessage(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control?.errors || !control.touched) return '';

    if (control.errors['required']) return this.translate.instant('testimonials.errors.required');
    if (control.errors['minlength']) {
      const count = control.errors['minlength'].requiredLength;
      return this.translate.instant('testimonials.errors.minlength', { count });
    }
    if (control.errors['maxlength']) {
      const count = control.errors['maxlength'].requiredLength;
      return this.translate.instant('testimonials.errors.maxlength', { count });
    }
    if (control.errors['email']) return this.translate.instant('testimonials.errors.email');
    if (control.errors['min'] || control.errors['max']) {
      return this.translate.instant('testimonials.errors.rating_required');
    }

    return this.translate.instant('testimonials.errors.invalid');
  }

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  formatDate(date: string): string {
    const locale = DATE_LOCALES[this.langService.current()] ?? 'it-IT';
    return new Date(date).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
