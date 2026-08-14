import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NotesService, Note } from '../../services/notes.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-article-notes',
  templateUrl: './article-notes.component.html',
  styleUrls: ['./article-notes.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArticleNotesComponent implements OnInit, OnDestroy {
  @Input() articleId: string;

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
  ) {
    this.form = this.createForm();
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
    this.notesService
      .getNotes(this.articleId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.notes = response.data;
          this.totalNotes = response.total;
          this.isLoadingNotes = false;
        },
        error: (error) => {
          console.error('Error loading notes:', error);
          this.isLoadingNotes = false;
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

          setTimeout(() => {
            this.submitSuccess = false;
          }, 5000);
        },
        error: (error) => {
          this.submitError =
            error.error?.message ||
            'Si è verificato un errore. Riprova più tardi.';
          this.isSubmittingNote = false;
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
      return 'Questo campo è obbligatorio';
    }
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `Minimo ${minLength} caratteri`;
    }
    if (control.errors['maxlength']) {
      const maxLength = control.errors['maxlength'].requiredLength;
      return `Massimo ${maxLength} caratteri`;
    }
    if (control.errors['email']) {
      return 'Email non valida';
    }

    return 'Campo non valido';
  }

  formatDate(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
