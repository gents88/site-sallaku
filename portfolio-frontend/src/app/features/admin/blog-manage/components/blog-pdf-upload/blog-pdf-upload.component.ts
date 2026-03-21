import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { BlogLanguage } from '../../../../../core/models/post.model';

export interface BlogPdfUploadRequest {
  file: File;
  language: BlogLanguage;
  context: string;
}

@Component({
  selector: 'app-blog-pdf-upload',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './blog-pdf-upload.component.html',
  styleUrls: ['./blog-pdf-upload.component.scss'],
})
export class BlogPdfUploadComponent {
  @Input() loading = false;
  @Input() progress = 0;
  @Input() maxFileSizeMb = 10;
  @Input() processing = false;
  @Output() generateRequested = new EventEmitter<BlogPdfUploadRequest>();

  selectedFile: File | null = null;
  validationMessage = '';

  readonly uploadForm = this.fb.nonNullable.group({
    language: ['en' as BlogLanguage, Validators.required],
    context: [''],
  });

  constructor(private readonly fb: FormBuilder) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.selectedFile = null;
    this.validationMessage = '';

    if (!file) {
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.validationMessage = 'Only PDF files are allowed.';
      input.value = '';
      return;
    }

    const maxBytes = this.maxFileSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      this.validationMessage = `The selected file exceeds ${this.maxFileSizeMb} MB.`;
      input.value = '';
      return;
    }

    this.selectedFile = file;
  }

  submit(): void {
    if (!this.selectedFile || this.uploadForm.invalid || this.loading) {
      if (!this.selectedFile) {
        this.validationMessage = 'Choose a PDF before generating a draft.';
      }
      return;
    }

    this.generateRequested.emit({
      file: this.selectedFile,
      language: this.uploadForm.getRawValue().language,
      context: this.uploadForm.getRawValue().context.trim(),
    });
  }
}