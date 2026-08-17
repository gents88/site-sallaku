import { ChangeDetectorRef, Component, OnInit, AfterViewInit, ElementRef, inject, PLATFORM_ID } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { take } from 'rxjs/operators';
import { ContactService } from '../../core/services/contact.service';
import { SeoService, SITE_ORIGIN } from '../../core/services/seo.service';
import { LanguageService, withLangPrefix } from '../../core/services/language.service';
import { loadStylesheetOnce } from '../../core/utils/load-stylesheet';
import { MATERIAL_CSS } from '../../core/utils/vendor-css.generated';
import { TurnstileWidgetComponent } from '../../shared/components/turnstile-widget/turnstile-widget.component';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule,
    MatIconModule, MatSnackBarModule, TurnstileWidgetComponent,
  ],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent implements OnInit, AfterViewInit {
  form = this.fb.group({
    name:    ['', [Validators.required, Validators.maxLength(80)]],
    email:   ['', [Validators.required, Validators.email]],
    subject: ['', [Validators.required, Validators.maxLength(150)]],
    message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  sending = false;
  sent = false;
  turnstileToken = '';

  constructor(
    private fb: FormBuilder,
    private el: ElementRef,
    private contactService: ContactService,
    private snackBar: MatSnackBar,
    private seo: SeoService,
    private langService: LanguageService,
    private cdr: ChangeDetectorRef,
  ) {}

  private readonly platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    // MatSnackBar is the only themed Material component on a public page, and
    // it renders in the overlay container — outside the admin shell that
    // normally pulls the theme in. Fetch it on the user's first keystroke
    // rather than on load: by the time anyone submits it's ready, and
    // visitors who only read the page never pay for it.
    this.form.valueChanges
      .pipe(take(1))
      .subscribe(() => void loadStylesheetOnce(MATERIAL_CSS));

    const pageUrl = `${SITE_ORIGIN}${withLangPrefix('/contact', this.langService.current())}`;
    this.seo.update({
      title: 'Contact',
      description: 'Get in touch with Gent Sallaku for web development projects, collaborations or freelance work.',
      url: pageUrl,
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      url: pageUrl,
      name: 'Contact Gent Sallaku',
      description: 'Get in touch with Gent Sallaku for web development projects.',
      author: {
        '@type': 'Person',
        '@id': 'https://gentsallaku.it/#person',
        name: 'Gent Sallaku',
      },
    });
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    this.el.nativeElement.querySelectorAll('.reveal').forEach((el: Element) => observer.observe(el));
  }

  onTurnstileVerified(token: string): void {
    this.turnstileToken = token;
  }

  send(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.sending = true;
    this.contactService.send({ ...(this.form.value as any), turnstileToken: this.turnstileToken }).subscribe({
      next: () => {
        this.sent = true;
        this.sending = false;
        this.form.reset();
        // Zoneless: nothing schedules change detection for a plain-property
        // mutation inside an HTTP callback, so the success state would never
        // reach the template without this.
        this.cdr.markForCheck();
        this.snackBar.open('Message sent! I\'ll get back to you soon.', 'Close', { duration: 5000 });
      },
      error: () => {
        this.sending = false;
        this.cdr.markForCheck();
        // Backend unavailable — fall back to mailto
        const v = this.form.value as any;
        const subject = encodeURIComponent(v.subject ?? '');
        const body = encodeURIComponent(`Name: ${v.name}\nEmail: ${v.email}\n\n${v.message}`);
        window.open(`mailto:gentsallaku@gmail.com?subject=${subject}&body=${body}`, '_blank');
        this.snackBar.open('Opening your email client as fallback…', 'OK', { duration: 5000 });
      },
    });
  }
}
