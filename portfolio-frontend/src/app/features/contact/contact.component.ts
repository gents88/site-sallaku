import { Component, OnInit, AfterViewInit, ElementRef } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ContactService } from '../../core/services/contact.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, TranslateModule,
    MatIconModule, MatSnackBarModule,
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

  constructor(
    private fb: FormBuilder,
    private el: ElementRef,
    private contactService: ContactService,
    private snackBar: MatSnackBar,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    this.seo.update({ title: 'Contact', description: 'Get in touch with me.' });
  }

  ngAfterViewInit(): void {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    this.el.nativeElement.querySelectorAll('.reveal').forEach((el: Element) => observer.observe(el));
  }

  send(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.sending = true;
    this.contactService.send(this.form.value as any).subscribe({
      next: () => {
        this.sent = true;
        this.sending = false;
        this.form.reset();
        this.snackBar.open('Message sent! I\'ll get back to you soon.', 'Close', { duration: 5000 });
      },
      error: () => {
        this.sending = false;
        // Backend unavailable — fall back to mailto
        const v = this.form.value as any;
        const subject = encodeURIComponent(v.subject ?? '');
        const body = encodeURIComponent(`Name: ${v.name}\nEmail: ${v.email}\n\n${v.message}`);
        window.open(`mailto:gentsallaku@email.com?subject=${subject}&body=${body}`, '_blank');
        this.snackBar.open('Opening your email client as fallback…', 'OK', { duration: 5000 });
      },
    });
  }
}
