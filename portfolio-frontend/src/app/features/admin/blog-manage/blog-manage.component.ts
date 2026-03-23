import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Subject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { debounceTime, filter, finalize, takeUntil, timeout } from 'rxjs/operators';
import { BlogService } from '../../../core/services/blog.service';
import { BlogPdfDraft, BlogLanguage, CreatePostPayload, Post, PdfExtractResult } from '../../../core/models/post.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { environment } from '../../../../environments/environment';
import {
  BlogPdfUploadComponent,
  BlogPdfUploadRequest,
} from './components/blog-pdf-upload/blog-pdf-upload.component';

interface PdfPreview {
  fileName: string;
  pageCount: number;
  wordCount: number;
  inferredTitle: string;
  paragraphs: string[];
  rawText: string;
}

@Component({
  selector: 'app-blog-manage',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
    MatSnackBarModule, MatChipsModule, LoadingSpinnerComponent,
    MatSelectModule, BlogPdfUploadComponent, MatTooltipModule, MatProgressBarModule,
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

  // Language tab state
  activeTab: BlogLanguage = 'it';
  translating = false;

  // PDF extract state
  extractingPdf = false;
  pdfPreview: PdfPreview | null = null;

  private destroy$ = new Subject<void>();

  @ViewChild('contentTextarea', { read: ElementRef })
  contentTextareaRef!: ElementRef<HTMLTextAreaElement>;

  form = this.fb.group({
    title:           ['', [Validators.required, Validators.minLength(3)]],
    subtitle:        [''],
    slug:            [''],
    language:        ['it' as BlogLanguage],
    content:         ['', [Validators.required, Validators.minLength(10)]],
    excerpt:         [''],
    coverImage:      [''],
    metaTitle:       [''],
    metaDescription: [''],
    // Translations
    title_en:        [''],
    title_sq:        [''],
    content_en:      [''],
    content_sq:      [''],
    excerpt_en:      [''],
    excerpt_sq:      [''],
  });

  // ── Active-language control getters ────────────────────────────────────────

  get activeTitleControl(): FormControl {
    switch (this.activeTab) {
      case 'en': return this.form.get('title_en') as FormControl;
      case 'sq': return this.form.get('title_sq') as FormControl;
      default:   return this.form.get('title') as FormControl;
    }
  }

  get activeContentControl(): FormControl {
    switch (this.activeTab) {
      case 'en': return this.form.get('content_en') as FormControl;
      case 'sq': return this.form.get('content_sq') as FormControl;
      default:   return this.form.get('content') as FormControl;
    }
  }

  get activeExcerptControl(): FormControl {
    switch (this.activeTab) {
      case 'en': return this.form.get('excerpt_en') as FormControl;
      case 'sq': return this.form.get('excerpt_sq') as FormControl;
      default:   return this.form.get('excerpt') as FormControl;
    }
  }

  get hasEnTranslation(): boolean {
    return !!(this.form.get('title_en')?.value || this.form.get('content_en')?.value);
  }

  get hasSqTranslation(): boolean {
    return !!(this.form.get('title_sq')?.value || this.form.get('content_sq')?.value);
  }

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
      error: () => { this.loading = false; },
    });
  }

  switchTab(lang: BlogLanguage): void {
    this.activeTab = lang;
  }

  openCreate(): void {
    this.editingId = null;
    this.tags = [];
    this.slugManuallyEdited = false;
    this.autosaveStatus = 'idle';
    this.autosaveTime = null;
    this.showPreview = false;
    this.activeTab = 'it';
    this.pdfPreview = null;
    this.resetGenerationState();
    this.form.reset({ language: 'it' });
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
    this.activeTab = 'it';
    this.pdfPreview = null;
    this.resetGenerationState();
    this.form.patchValue({
      title: post.title, subtitle: post.subtitle, slug: post.slug, language: post.language,
      content: post.content, excerpt: post.excerpt,
      coverImage: post.coverImage, metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      title_en: post.title_en || '', title_sq: post.title_sq || '',
      content_en: post.content_en || '', content_sq: post.content_sq || '',
      excerpt_en: post.excerpt_en || '', excerpt_sq: post.excerpt_sq || '',
    });
    this.showForm = true;
    this.setupAutoSave();
    this.setupSlugFromTitle();
  }

  closeForm(): void {
    this.showForm = false;
    this.showPreview = false;
    this.pdfPreview = null;
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
    if (this.form.get('title')?.invalid || this.form.get('content')?.invalid) {
      this.form.get('title')?.markAsTouched();
      this.form.get('content')?.markAsTouched();
      this.activeTab = 'it';
      this.snackBar.open('Italian title and content are required.', 'Close', { duration: 3000 });
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
    this.activeContentControl.setValue(newValue, { emitEvent: true });

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
      language: raw.language || 'it',
      published,
    };

    if (subtitle)        payload.subtitle = subtitle;
    if (slug)            payload.slug = slug;
    if (excerpt)         payload.excerpt = excerpt;
    if (coverImage)      payload.coverImage = coverImage;
    if (tags.length)     payload.tags = tags;
    if (metaTitle)       payload.metaTitle = metaTitle;
    if (metaDescription) payload.metaDescription = metaDescription;

    const title_en   = this.cleanOptional(raw.title_en);
    const title_sq   = this.cleanOptional(raw.title_sq);
    const content_en = this.cleanOptional(raw.content_en);
    const content_sq = this.cleanOptional(raw.content_sq);
    const excerpt_en = this.cleanOptional(raw.excerpt_en);
    const excerpt_sq = this.cleanOptional(raw.excerpt_sq);

    if (title_en)   payload.title_en   = title_en;
    if (title_sq)   payload.title_sq   = title_sq;
    if (content_en) payload.content_en = content_en;
    if (content_sq) payload.content_sq = content_sq;
    if (excerpt_en) payload.excerpt_en = excerpt_en;
    if (excerpt_sq) payload.excerpt_sq = excerpt_sq;

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

  // ── PDF extract (simple, no AI) ─────────────────────────────────────

  onPdfFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      this.snackBar.open('Only PDF files are allowed.', 'Close', { duration: 3000 });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.snackBar.open('PDF must be smaller than 10 MB.', 'Close', { duration: 3000 });
      return;
    }

    this.extractingPdf = true;
    this.pdfPreview = null;

    this.blogService.extractPdf(file).subscribe({
      next: (result: PdfExtractResult) => {
        this.extractingPdf = false;
        this.pdfPreview = this.buildPdfPreview(result);
      },
      error: err => {
        this.extractingPdf = false;
        const msg = err?.error?.message || 'Could not extract text from this PDF.';
        this.snackBar.open(Array.isArray(msg) ? msg.join(', ') : msg, 'Close', { duration: 4000 });
      },
    });
  }

  private buildPdfPreview(result: PdfExtractResult): PdfPreview {
    const lines = result.rawText.split('\n\n').map((l: string) => l.trim()).filter(Boolean);
    const inferredTitle = lines[0]?.slice(0, 120) ?? result.fileName.replace(/\.pdf$/i, '');
    const paragraphs = lines.slice(1, 12);
    return { fileName: result.fileName, pageCount: result.pageCount, wordCount: result.wordCount, inferredTitle, paragraphs, rawText: result.rawText };
  }

  applyPdfContent(): void {
    if (!this.pdfPreview) return;
    const html = this.pdfPreview.paragraphs.map(p => `<p>${p}</p>`).join('\n');
    this.form.patchValue({
      title: this.pdfPreview.inferredTitle,
      content: html || `<p>${this.pdfPreview.rawText.slice(0, 5000)}</p>`,
    });
    this.slugManuallyEdited = false;
    this.activeTab = 'it';
    this.snackBar.open('Content applied. Review and translate when ready.', 'Close', { duration: 3500 });
  }

  clearPdfPreview(): void {
    this.pdfPreview = null;
  }

  // ── Translation ───────────────────────────────────────────

  async translateAll(): Promise<void> {
    const title   = (this.form.get('title')?.value || '').trim();
    const content = (this.form.get('content')?.value || '').trim();
    const excerpt = (this.form.get('excerpt')?.value || '').trim();

    if (!title) {
      this.snackBar.open('Add Italian title first.', 'Close', { duration: 3000 });
      return;
    }

    this.translating = true;
    const plainContent = this.stripHtml(content);

    try {
      const [titleEn, contentEn, excerptEn] = await Promise.all([
        title        ? firstValueFrom(this.blogService.translateText(title, 'it', 'en'))        : Promise.resolve(''),
        plainContent ? firstValueFrom(this.blogService.translateText(plainContent, 'it', 'en')) : Promise.resolve(''),
        excerpt      ? firstValueFrom(this.blogService.translateText(excerpt, 'it', 'en'))      : Promise.resolve(''),
      ]);
      this.form.patchValue({
        title_en:   titleEn,
        content_en: contentEn ? this.textToHtml(contentEn) : '',
        excerpt_en: excerptEn,
      });

      const [titleSq, contentSq, excerptSq] = await Promise.all([
        title        ? firstValueFrom(this.blogService.translateText(title, 'it', 'sq'))        : Promise.resolve(''),
        plainContent ? firstValueFrom(this.blogService.translateText(plainContent, 'it', 'sq')) : Promise.resolve(''),
        excerpt      ? firstValueFrom(this.blogService.translateText(excerpt, 'it', 'sq'))      : Promise.resolve(''),
      ]);
      this.form.patchValue({
        title_sq:   titleSq,
        content_sq: contentSq ? this.textToHtml(contentSq) : '',
        excerpt_sq: excerptSq,
      });

      this.snackBar.open('Translated to English and Albanian. Review before publishing.', 'Close', { duration: 4000 });
    } catch {
      this.snackBar.open('Translation failed. Check your connection and try again.', 'Close', { duration: 4000 });
    } finally {
      this.translating = false;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim();
  }

  private textToHtml(text: string): string {
    return text.split('\n\n').filter(Boolean).map(p => `<p>${p.trim()}</p>`).join('\n');
  }
}
