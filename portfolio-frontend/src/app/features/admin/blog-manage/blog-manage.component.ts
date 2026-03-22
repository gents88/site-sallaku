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
import { finalize, timeout } from 'rxjs';
import { BlogService } from '../../../core/services/blog.service';
import { BlogPdfDraft, BlogLanguage, CreatePostPayload, Post } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { environment } from '../../../../environments/environment';
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
  readonly pdfGenerationEnabled = environment.blogPdfUploadEnabled;
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
    this.blogService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: posts => { this.posts = posts; },
      error: () => {},
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Serve almeno titolo e contenuto.', 'Close', { duration: 3000 });
      return;
    }

    const payload = this.buildPayload();
    this.saving = true;
    const req$ = this.editingId
      ? this.blogService.update(this.editingId, payload)
      : this.blogService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false; this.showForm = false;
        this.snackBar.open('Post saved!', 'Close', { duration: 3000 });
        this.load();
      },
      error: error => {
        this.saving = false;
        this.snackBar.open(this.resolveSaveError(error), 'Close', { duration: 4500 });
      },
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

  private buildPayload(): CreatePostPayload {
    const raw = this.form.getRawValue();
    const title = (raw.title ?? '').trim();
    const content = (raw.content ?? '').trim();
    const subtitle = this.cleanOptional(raw.subtitle);
    const excerpt = this.cleanOptional(raw.excerpt);
    const slug = this.slugifyValue(raw.slug);
    const metaTitle = this.cleanOptional(raw.metaTitle);
    const metaDescription = this.cleanOptional(raw.metaDescription);
    const coverImage = this.normalizeCoverImage(raw.coverImage);
    const tags = this.tags
      .map(tag => tag.trim())
      .filter(Boolean)
      .filter((tag, index, all) => all.indexOf(tag) === index);

    const payload: CreatePostPayload = {
      title,
      content,
      language: raw.language || 'en',
      published: !!raw.published,
    };

    if (subtitle) payload.subtitle = subtitle;
    if (slug) payload.slug = slug;
    if (excerpt) payload.excerpt = excerpt;
    if (coverImage) payload.coverImage = coverImage;
    if (tags.length) payload.tags = tags;
    if (metaTitle) payload.metaTitle = metaTitle;
    if (metaDescription) payload.metaDescription = metaDescription;

    return payload;
  }

  private cleanOptional(value: string | null | undefined): string | undefined {
    const cleaned = (value ?? '').trim();
    return cleaned || undefined;
  }

  private slugifyValue(value: string | null | undefined): string | undefined {
    const normalized = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || undefined;
  }

  private normalizeCoverImage(value: string | null | undefined): string | undefined {
    const cleaned = this.cleanOptional(value);
    if (!cleaned) {
      return undefined;
    }

    // Avoid oversized JSON payloads from base64 images; backend currently accepts URL strings only reliably.
    if (cleaned.startsWith('data:')) {
      this.snackBar.open('Per la cover usa un URL immagine. L\'upload file diretto non e supportato in questo form.', 'Close', { duration: 5000 });
      return undefined;
    }

    return cleaned;
  }

  private resolveSaveError(error: any): string {
    const status = error?.status;
    const message = error?.error?.message;

    if (Array.isArray(message) && message.length) {
      return message.join(', ');
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (status === 413) {
      return 'Payload troppo grande. Rimuovi immagini inline/base64 e salva solo testo o URL immagine.';
    }

    if (status === 401 || status === 403) {
      return 'Sessione admin non valida. Riesegui il login.';
    }

    return 'Salvataggio non riuscito. Controlla titolo, contenuto e slug.';
  }
}
