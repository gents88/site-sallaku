import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Subject } from 'rxjs';
import { debounceTime, filter, finalize, takeUntil, timeout } from 'rxjs/operators';
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
    MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent,
    MatSelectModule, BlogPdfUploadComponent, MatTooltipModule,
  ],
  templateUrl: './blog-manage.component.html',
  styleUrls: ['./blog-manage.component.scss'],
})
export class BlogManageComponent implements OnInit, OnDestroy {
  readonly pdfGenerationEnabled = environment.blogPdfUploadEnabled;

  posts: Post[] = [];
  loading = true;
  showForm = false;
  editingId: string | null = null;
  saving = false;
  autoSaving = false;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error' = 'idle';
  autosaveTime: Date | null = null;
  showPreview = false;
  generatingDraft = false;
  uploadProgress = 0;
  processingDraft = false;
  separatorKeys = [ENTER, COMMA];
  tags: string[] = [];
  generationWarnings: string[] = [];
  sourceSummary: BlogPdfDraft['source'] | null = null;
  featuredImagePrompt = '';
  slugManuallyEdited = false;

  private destroy$ = new Subject<void>();

  @ViewChild('contentTextarea', { read: ElementRef })
  contentTextareaRef!: ElementRef<HTMLTextAreaElement>;

  form = this.fb.group({
    title:           ['', [Validators.required, Validators.minLength(3)]],
    subtitle:        [''],
    slug:            [''],
    language:        ['en' as BlogLanguage],
    content:         ['', [Validators.required, Validators.minLength(10)]],
    excerpt:         [''],
    coverImage:      [''],
    metaTitle:       [''],
    metaDescription: [''],
  });

  constructor(
    private blogService: BlogService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.blogService.getAll().pipe(
      timeout(15000),
      finalize(() => { this.loading = false; }),
    ).subscribe({
      next: posts => { this.posts = posts; this.loading = false; },
      error: () => {},
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.tags = [];
    this.slugManuallyEdited = false;
    this.autosaveStatus = 'idle';
    this.autosaveTime = null;
    this.showPreview = false;
    this.resetGenerationState();
    this.form.reset({ language: 'en' });
    this.showForm = true;
    this.setupAutoSave();
    this.setupSlugFromTitle();
  }

  openEdit(post: Post): void {
    this.editingId = post._id;
    this.tags = [...post.tags];
    this.slugManuallyEdited = true;
    this.autosaveStatus = 'idle';
    this.autosaveTime = null;
    this.showPreview = false;
    this.resetGenerationState();
    this.form.patchValue({
      title: post.title, subtitle: post.subtitle, slug: post.slug, language: post.language,
      content: post.content, excerpt: post.excerpt,
      coverImage: post.coverImage, metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
    });
    this.showForm = true;
    this.setupAutoSave();
    this.setupSlugFromTitle();
  }

  closeForm(): void {
    this.showForm = false;
    this.showPreview = false;
    this.resetGenerationState();
    this.destroy$.next();
  }

  togglePreview(): void {
    this.showPreview = !this.showPreview;
  }

  private setupAutoSave(): void {
    this.form.valueChanges.pipe(
      debounceTime(7000),
      filter(() => !this.saving && !this.autoSaving),
      filter(() => {
        const title = (this.form.get('title')?.value || '').trim();
        const content = (this.form.get('content')?.value || '').trim();
        return title.length >= 3 && content.length >= 10;
      }),
      takeUntil(this.destroy$),
    ).subscribe(() => this.performAutoSave());
  }

  private setupSlugFromTitle(): void {
    this.form.get('title')?.valueChanges.pipe(
      debounceTime(400),
      takeUntil(this.destroy$),
    ).subscribe(value => {
      if (!this.slugManuallyEdited) {
        this.form.get('slug')?.setValue(this.slugifyStr(value || ''), { emitEvent: false });
      }
    });
  }

  onSlugManualEdit(): void {
    const slug = this.form.get('slug')?.value || '';
    this.slugManuallyEdited = slug.trim().length > 0;
  }

  private performAutoSave(): void {
    if (this.saving || this.autoSaving) return;
    const payload = this.buildPayload(false);
    this.autoSaving = true;
    this.autosaveStatus = 'saving';

    const req$ = this.editingId
      ? this.blogService.update(this.editingId, payload)
      : this.blogService.create(payload);

    req$.subscribe({
      next: (post) => {
        this.autoSaving = false;
        this.autosaveStatus = 'saved';
        this.autosaveTime = new Date();
        if (!this.editingId) {
          this.editingId = post._id;
        }
      },
      error: () => {
        this.autoSaving = false;
        this.autosaveStatus = 'error';
      },
    });
  }

  saveDraft(): void { this.save(false); }
  publish(): void { this.save(true); }

  save(published: boolean): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Title and content are required.', 'Close', { duration: 3000 });
      return;
    }

    const payload = this.buildPayload(published);
    this.saving = true;
    const req$ = this.editingId
      ? this.blogService.update(this.editingId, payload)
      : this.blogService.create(payload);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.showForm = false;
        this.autosaveStatus = 'idle';
        this.snackBar.open(published ? 'Article published!' : 'Draft saved!', 'Close', { duration: 3000 });
        this.load();
        this.destroy$.next();
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

  /** Insert HTML formatting around the selected text (or a placeholder) in the content textarea. */
  insertFormat(format: string): void {
    const ta = this.contentTextareaRef?.nativeElement;
    if (!ta) return;

    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = ta.value.slice(start, end);

    let before = '';
    let after = '';
    let placeholder = 'text';

    switch (format) {
      case 'bold':      before = '<strong>'; after = '</strong>'; placeholder = 'bold text'; break;
      case 'italic':    before = '<em>'; after = '</em>'; placeholder = 'italic text'; break;
      case 'h2':        before = '\n<h2>'; after = '</h2>\n'; placeholder = 'Heading'; break;
      case 'h3':        before = '\n<h3>'; after = '</h3>\n'; placeholder = 'Subheading'; break;
      case 'code':      before = '<code>'; after = '</code>'; placeholder = 'code'; break;
      case 'pre':       before = '\n<pre><code>\n'; after = '\n</code></pre>\n'; placeholder = '// code block'; break;
      case 'ul':        before = '\n<ul>\n  <li>'; after = '</li>\n</ul>\n'; placeholder = 'list item'; break;
      case 'ol':        before = '\n<ol>\n  <li>'; after = '</li>\n</ol>\n'; placeholder = 'list item'; break;
      case 'blockquote':before = '\n<blockquote>'; after = '</blockquote>\n'; placeholder = 'quote'; break;
      case 'link':      before = '<a href="url">'; after = '</a>'; placeholder = selected || 'link text'; break;
      case 'hr':        before = '\n<hr>\n'; after = ''; placeholder = ''; break;
      case 'p':         before = '\n<p>'; after = '</p>\n'; placeholder = 'paragraph'; break;
    }

    const insertText = selected || placeholder;
    const newValue = ta.value.slice(0, start) + before + insertText + after + ta.value.slice(end);
    this.form.get('content')?.setValue(newValue, { emitEvent: true });

    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + insertText.length;
    });
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

  private applyGeneratedDraft(draft: BlogPdfDraft): void {
    this.tags = [...draft.tags];
    this.generationWarnings = draft.warnings;
    this.sourceSummary = draft.source;
    this.featuredImagePrompt = draft.imageHandling.featuredImageSuggestion.prompt;
    this.slugManuallyEdited = true;
    this.form.patchValue({
      title: draft.title, subtitle: draft.subtitle, slug: draft.slug,
      language: draft.language, content: draft.content, excerpt: draft.excerpt,
      coverImage: draft.coverImage, metaTitle: draft.metaTitle, metaDescription: draft.metaDescription,
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

  private buildPayload(published: boolean): CreatePostPayload {
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
      published,
    };

    if (subtitle)         payload.subtitle = subtitle;
    if (slug)             payload.slug = slug;
    if (excerpt)          payload.excerpt = excerpt;
    if (coverImage)       payload.coverImage = coverImage;
    if (tags.length)      payload.tags = tags;
    if (metaTitle)        payload.metaTitle = metaTitle;
    if (metaDescription)  payload.metaDescription = metaDescription;

    return payload;
  }

  private cleanOptional(value: string | null | undefined): string | undefined {
    const cleaned = (value ?? '').trim();
    return cleaned || undefined;
  }

  private slugifyStr(value: string): string {
    return value.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private slugifyValue(value: string | null | undefined): string | undefined {
    const slug = this.slugifyStr(value || '');
    return slug || undefined;
  }

  private normalizeCoverImage(value: string | null | undefined): string | undefined {
    const cleaned = this.cleanOptional(value);
    if (!cleaned) return undefined;
    if (cleaned.startsWith('data:')) {
      this.snackBar.open('Use an image URL for cover. Direct file upload is not supported.', 'Close', { duration: 5000 });
      return undefined;
    }
    return cleaned;
  }

  private resolveSaveError(error: any): string {
    const status = error?.status;
    const message = error?.error?.message;
    if (Array.isArray(message) && message.length) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
    if (status === 413) return 'Payload too large. Remove inline images and use image URLs instead.';
    if (status === 401 || status === 403) return 'Session expired. Please log in again.';
    return 'Save failed. Check title, content and slug.';
  }
}
