import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize, timeout, Observable } from 'rxjs';
import { TestimonialsAdminService } from '../../../core/services/testimonials-admin.service';
import { AdminTestimonial, TestimonialModerationStatus } from '../../../core/models/testimonial-admin.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-testimonials-manage',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, TranslateModule,
    MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule,
    LoadingSpinnerComponent, RatingStarsComponent,
  ],
  templateUrl: './testimonials-manage.component.html',
  styleUrls: ['./testimonials-manage.component.scss'],
})
export class TestimonialsManageComponent implements OnInit {
  testimonials: AdminTestimonial[] = [];
  total = 0;
  loading = true;
  status: TestimonialModerationStatus = 'pending';
  skip = 0;
  actioningId: string | null = null;
  editingId: string | null = null;
  editDraft = '';

  readonly statuses: TestimonialModerationStatus[] = ['pending', 'approved', 'spam', 'all'];

  constructor(
    private testimonialsAdminService: TestimonialsAdminService,
    private snackBar: MatSnackBar,
    private t: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  switchStatus(status: TestimonialModerationStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.skip = 0;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.testimonialsAdminService.list(this.status, PAGE_SIZE, this.skip).pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => { this.testimonials = res.data; this.total = res.total; },
      error: () => {
        this.snackBar.open(this.t.instant('testimonials_manage.load_error'), this.t.instant('common.close'), { duration: 3500 });
      },
    });
  }

  nextPage(): void {
    if (this.skip + PAGE_SIZE >= this.total) return;
    this.skip += PAGE_SIZE;
    this.load();
  }

  prevPage(): void {
    if (this.skip === 0) return;
    this.skip = Math.max(0, this.skip - PAGE_SIZE);
    this.load();
  }

  approve(item: AdminTestimonial): void {
    this.runAction(item, this.testimonialsAdminService.approve(item.id), 'testimonials_manage.approved');
  }

  reject(item: AdminTestimonial): void {
    this.runAction(item, this.testimonialsAdminService.reject(item.id), 'testimonials_manage.rejected');
  }

  markSpam(item: AdminTestimonial): void {
    this.runAction(item, this.testimonialsAdminService.markSpam(item.id), 'testimonials_manage.marked_spam');
  }

  toggleFeatured(item: AdminTestimonial): void {
    const successKey = item.featured ? 'testimonials_manage.featured_off' : 'testimonials_manage.featured_on';
    this.runAction(item, this.testimonialsAdminService.setFeatured(item.id, !item.featured), successKey);
  }

  startEdit(item: AdminTestimonial): void {
    this.editingId = item.id;
    this.editDraft = item.content;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editDraft = '';
  }

  saveEdit(item: AdminTestimonial): void {
    const content = this.editDraft.trim();
    if (content.length < 10 || content.length > 600) return;
    this.actioningId = item.id;
    this.testimonialsAdminService.updateContent(item.id, content).pipe(
      finalize(() => { this.actioningId = null; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.editingId = null;
        this.snackBar.open(this.t.instant('testimonials_manage.content_updated'), this.t.instant('common.close'), { duration: 2500 });
        this.load();
      },
      error: () => {
        this.snackBar.open(this.t.instant('testimonials_manage.action_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }

  delete(item: AdminTestimonial): void {
    if (!confirm(this.t.instant('testimonials_manage.confirm_delete'))) return;
    this.runAction(item, this.testimonialsAdminService.remove(item.id), 'testimonials_manage.deleted');
  }

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  private runAction(item: AdminTestimonial, request$: Observable<unknown>, successKey: string): void {
    this.actioningId = item.id;
    request$.pipe(
      finalize(() => { this.actioningId = null; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.snackBar.open(this.t.instant(successKey), this.t.instant('common.close'), { duration: 2500 });
        // Reload rather than patch locally: a moderation action can change
        // whether the item still belongs in the tab currently shown.
        this.load();
      },
      error: () => {
        this.snackBar.open(this.t.instant('testimonials_manage.action_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }
}
