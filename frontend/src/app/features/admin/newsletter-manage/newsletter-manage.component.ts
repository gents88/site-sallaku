import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize, timeout } from 'rxjs';
import { NewsletterAdminService } from '../../../core/services/newsletter-admin.service';
import { NewsletterCounts, NewsletterStatus, NewsletterSubscriber } from '../../../core/models/newsletter.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

const PAGE_SIZE = 20;

type StatusFilter = NewsletterStatus | 'all';

@Component({
  selector: 'app-newsletter-manage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule, MatButtonModule, MatIconModule, MatSnackBarModule, LoadingSpinnerComponent],
  templateUrl: './newsletter-manage.component.html',
  styleUrl: './newsletter-manage.component.scss',
})
export class NewsletterManageComponent implements OnInit {
  subscribers: NewsletterSubscriber[] = [];
  counts: NewsletterCounts | null = null;
  total = 0;
  page = 1;
  loading = true;
  exporting = false;
  removingId: string | null = null;
  status: StatusFilter = 'all';

  readonly statuses: StatusFilter[] = ['all', 'pending', 'confirmed', 'unsubscribed'];

  constructor(
    private newsletterAdminService: NewsletterAdminService,
    private snackBar: MatSnackBar,
    private t: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCounts();
    this.load();
  }

  switchStatus(status: StatusFilter): void {
    if (this.status === status) return;
    this.status = status;
    this.page = 1;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.newsletterAdminService.list(this.page, PAGE_SIZE, this.status === 'all' ? undefined : this.status).pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => { this.subscribers = res.data; this.total = res.total; },
      error: () => {
        this.snackBar.open(this.t.instant('newsletter_manage.load_error'), this.t.instant('common.close'), { duration: 3500 });
      },
    });
  }

  loadCounts(): void {
    this.newsletterAdminService.counts().subscribe({
      next: (counts) => { this.counts = counts; this.cdr.markForCheck(); },
      error: () => { /* non-critical — the list itself still loads */ },
    });
  }

  nextPage(): void {
    if (this.page * PAGE_SIZE >= this.total) return;
    this.page += 1;
    this.load();
  }

  prevPage(): void {
    if (this.page === 1) return;
    this.page -= 1;
    this.load();
  }

  remove(subscriber: NewsletterSubscriber): void {
    if (!confirm(this.t.instant('newsletter_manage.confirm_delete', { email: subscriber.email }))) return;

    this.removingId = subscriber._id;
    this.newsletterAdminService.remove(subscriber._id).pipe(
      finalize(() => { this.removingId = null; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.subscribers = this.subscribers.filter(s => s._id !== subscriber._id);
        this.total = Math.max(0, this.total - 1);
        this.loadCounts();
        this.snackBar.open(this.t.instant('newsletter_manage.deleted'), this.t.instant('common.close'), { duration: 2500 });
      },
      error: () => {
        this.snackBar.open(this.t.instant('newsletter_manage.delete_error'), this.t.instant('common.close'), { duration: 3500 });
      },
    });
  }

  exportCsv(): void {
    this.exporting = true;
    this.newsletterAdminService.exportCsv().pipe(
      finalize(() => { this.exporting = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `newsletter_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.snackBar.open(this.t.instant('newsletter_manage.export_error'), this.t.instant('common.close'), { duration: 3500 });
      },
    });
  }
}
