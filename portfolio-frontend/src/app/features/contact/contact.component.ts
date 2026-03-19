import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ContactService } from '../../core/services/contact.service';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatInputModule, MatFormFieldModule, MatButtonModule, MatIconModule, MatSnackBarModule,
  ],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss'],
})
export class ContactComponent implements OnInit {
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
    private contactService: ContactService,
    private snackBar: MatSnackBar,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    this.seo.update({ title: 'Contact', description: 'Get in touch with me.' });
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
        this.snackBar.open('Something went wrong. Please try again.', 'Close', {
          duration: 5000,
          panelClass: ['error-snack'],
        });
      },
    });
  }
}
