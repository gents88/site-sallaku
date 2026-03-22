import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { BlogService } from '../../../core/services/blog.service';
import { BlogPdfDraft, BlogLanguage, Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import {
  BlogPdfUploadComponent,
  BlogPdfUploadRequest,
} from './components/blog-pdf-upload/blog-pdf-upload.component';

@Component({
  selector: 'app-blog-manage',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatCheckboxModule, MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent,
    MatSelectModule, BlogPdfUploadComponent,
  ],
  templateUrl: './blog-manage.component.html',
  styleUrls: ['./blog-manage.component.scss'],
})
export class BlogManageComponent implements OnInit {
  posts: Post[] = [];
  loading = true;
  showForm = false;
  editingId: string | null = null;
  saving = false;
  generatingDraft = false;
  uploadProgress = 0;
  processingDraft = false;
  separatorKeys = [ENTER, COMMA];
  tags: string[] = [];
  generationWarnings: string[] = [];
  sourceSummary: BlogPdfDraft['source'] | null = null;
  featuredImagePrompt = '';
  readonly coverImageMaxSizeMb = 3;

  form = this.fb.group({
    title:           ['', Validators.required],
    subtitle:        [''],
    slug:            [''],
    language:        ['en' as BlogLanguage, Validators.required],
    content:         ['', Validators.required],
    excerpt:         [''],
    coverImage:      [''],
    metaTitle:       [''],
    metaDescription: [''],
    published:       [false],
  });

  constructor(
    private blogService: BlogService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.blogService.getAll().subscribe({
      next: posts => { this.posts = posts; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.tags = [];
    this.resetGenerationState();
    this.form.reset({ language: 'en', published: false });
    this.showForm = true;
  }

  openEdit(post: Post): void {
    this.editingId = post._id;
    this.tags = [...post.tags];
    this.resetGenerationState();
    this.form.patchValue({
      title: post.title, subtitle: post.subtitle, slug: post.slug, language: post.language,
      content: post.content, excerpt: post.excerpt,
      coverImage: post.coverImage, metaTitle: post.metaTitle,
      metaDescription: post.metaDescription, published: post.published,
    });
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.resetGenerationState();
  }

  generateDraft(request: BlogPdfUploadRequest): void {
    this.generatingDraft = true;
    this.processingDraft = false;
    this.uploadProgress = 0;
    this.generationWarnings = [];
    this.sourceSummary = null;

    this.blogService.generateFromPdf(request.file, request.language, request.context).subscribe({
      next: event => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || request.file.size || 1;
          this.uploadProgress = Math.min(100, Math.round((event.loaded / total) * 100));
          this.processingDraft = this.uploadProgress >= 100;
          return;
        }

        if (event.type === HttpEventType.Response && event.body) {
          this.uploadProgress = 100;
          this.processingDraft = false;
          this.generatingDraft = false;
          this.applyGeneratedDraft(event.body);
          this.snackBar.open('Draft generated from PDF.', 'Close', { duration: 3500 });
        }
      },
      error: error => {
        this.generatingDraft = false;
        this.processingDraft = false;
        this.uploadProgress = 0;
        const message = error?.error?.message || 'Failed to process the PDF.';
        this.snackBar.open(Array.isArray(message) ? message.join(', ') : message, 'Close', { duration: 4000 });
      },
    });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving = true;
    const payload = { ...this.form.value, tags: this.tags } as any;
    const req$ = this.editingId
      ? this.blogService.update(this.editingId, payload)
      : this.blogService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false; this.showForm = false;
        this.snackBar.open('Post saved!', 'Close', { duration: 3000 });
        this.load();
      },
      error: () => { this.saving = false; this.snackBar.open('Failed to save.', 'Close', { duration: 3000 }); },
    });
  }

  delete(id: string): void {
    if (!confirm('Delete this post?')) return;
    this.blogService.remove(id).subscribe({
      next: () => {
        this.posts = this.posts.filter(p => p._id !== id);
        this.snackBar.open('Post deleted.', 'Close', { duration: 3000 });
      },
    });
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) this.tags.push(value);
    event.chipInput!.clear();
  }

  removeTag(tag: string): void {
    const idx = this.tags.indexOf(tag);
    if (idx >= 0) this.tags.splice(idx, 1);
  }

  onCoverImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Only image files are allowed for the cover upload.', 'Close', { duration: 3500 });
      input.value = '';
      return;
    }

    if (file.size > this.coverImageMaxSizeMb * 1024 * 1024) {
      this.snackBar.open(`Cover images must stay under ${this.coverImageMaxSizeMb} MB.`, 'Close', { duration: 3500 });
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.form.patchValue({ coverImage: typeof reader.result === 'string' ? reader.result : '' });
      this.snackBar.open('Cover image loaded into the draft.', 'Close', { duration: 2500 });
    };
    reader.readAsDataURL(file);
  }

  private applyGeneratedDraft(draft: BlogPdfDraft): void {
    this.tags = [...draft.tags];
    this.generationWarnings = draft.warnings;
    this.sourceSummary = draft.source;
    this.featuredImagePrompt = draft.imageHandling.featuredImageSuggestion.prompt;
    this.form.patchValue({
      title: draft.title,
      subtitle: draft.subtitle,
      slug: draft.slug,
      language: draft.language,
      content: draft.content,
      excerpt: draft.excerpt,
      coverImage: draft.coverImage,
      metaTitle: draft.metaTitle,
      metaDescription: draft.metaDescription,
    });
  }

  private resetGenerationState(): void {
    this.generatingDraft = false;
    this.processingDraft = false;
    this.uploadProgress = 0;
    this.generationWarnings = [];
    this.sourceSummary = null;
    this.featuredImagePrompt = '';
  }
}
