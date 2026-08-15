import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NotesService, Note } from '../../services/notes.service';
import { LanguageService } from '../../../core/services/language.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  selector: 'app-article-notes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './article-notes.component.html',
  styleUrls: ['./article-notes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleNotesComponent implements OnInit, OnDestroy {
  @Input() articleId: string = '';

  form: FormGroup;
  notes: Note[] = [];
  isLoadingNotes = false;
  isSubmittingNote = false;
  submitError: string | null = null;
  submitSuccess = false;
  totalNotes = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private notesService: NotesService,
    private cdr: ChangeDetectorRef,
    private translate: TranslateService,
    private langService: LanguageService,
  ) {
    this.form = this.createForm();
    // Re-render on UI language change (OnPush requires explicit trigger) —
    // note dates and error messages are locale-dependent.
    effect(() => { this.langService.current(); this.cdr.markForCheck(); });
  }

  ngOnInit(): void {
    if (!this.articleId) {
      console.warn('ArticleNotesComponent: articleId input is required');
      return;
    }

    this.loadNotes();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.maxLength(100)]],
      email: ['', [Validators.email]],
      content: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(1000)]],
      website: ['', [Validators.maxLength(500)]],
      honeypot: [''],
    });
  }

  loadNotes(): void {
    this.isLoadingNotes = true;
    this.cdr.markForCheck();
    this.notesService
      .getNotes(this.articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.notes = response.data;
          this.totalNotes = response.total;
          this.isLoadingNotes = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          console.error('Error loading notes:', error);
          this.isLoadingNotes = false;
          this.cdr.markForCheck();
        },
      });
  }

  submitNote(): void {
    if (!this.form.valid) {
      this.markFormGroupTouched(this.form);
      return;
    }

    this.isSubmittingNote = true;
    this.submitError = null;

    const formValue = this.form.value;
    const payload = {
      name: formValue.name || undefined,
      email: formValue.email || undefined,
      content: formValue.content.trim(),
      website: formValue.website || undefined,
      honeypot: formValue.honeypot,
    };

    this.notesService
      .createNote(this.articleId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newNote) => {
          this.notesService.addNoteToCache(this.articleId, newNote);
          this.notes = [newNote, ...this.notes];
          this.totalNotes++;
          this.form.reset();
          this.submitSuccess = true;
          this.isSubmittingNote = false;
          this.cdr.markForCheck();

          setTimeout(() => {
            this.submitSuccess = false;
            this.cdr.markForCheck();
          }, 5000);
        },
        error: (error) => {
          this.submitError =
            error.error?.message ||
            this.translate.instant('notes.form.error_generic');
          this.isSubmittingNote = false;
          this.cdr.markForCheck();
        },
      });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control?.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return this.translate.instant('notes.errors.required');
    }
    if (control.errors['minlength']) {
      const count = control.errors['minlength'].requiredLength;
      return this.translate.instant('notes.errors.minlength', { count });
    }
    if (control.errors['maxlength']) {
      const count = control.errors['maxlength'].requiredLength;
      return this.translate.instant('notes.errors.maxlength', { count });
    }
    if (control.errors['email']) {
      return this.translate.instant('notes.errors.email');
    }

    return this.translate.instant('notes.errors.invalid');
  }

  formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const locale = DATE_LOCALES[this.langService.current()] ?? 'it-IT';
    return dateObj.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
