import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize, timeout, Observable } from 'rxjs';
import { NotesAdminService } from '../../../core/services/notes-admin.service';
import { AdminNote, NoteModerationStatus } from '../../../core/models/note-admin.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-notes-manage',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslateModule,
    MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule,
    LoadingSpinnerComponent,
  ],
  templateUrl: './notes-manage.component.html',
  styleUrls: ['./notes-manage.component.scss'],
})
export class NotesManageComponent implements OnInit {
  notes: AdminNote[] = [];
  total = 0;
  loading = true;
  status: NoteModerationStatus = 'pending';
  skip = 0;
  actioningId: string | null = null;

  readonly statuses: NoteModerationStatus[] = ['pending', 'approved', 'spam', 'all'];

  constructor(
    private notesAdminService: NotesAdminService,
    private snackBar: MatSnackBar,
    private t: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  switchStatus(status: NoteModerationStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.skip = 0;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.notesAdminService.list(this.status, PAGE_SIZE, this.skip).pipe(
      timeout(15000),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: (res) => { this.notes = res.data; this.total = res.total; },
      error: () => {
        this.snackBar.open(this.t.instant('notes_manage.load_error'), this.t.instant('common.close'), { duration: 3500 });
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

  approve(note: AdminNote): void {
    this.runAction(note, this.notesAdminService.approve(note.id), 'notes_manage.approved');
  }

  reject(note: AdminNote): void {
    this.runAction(note, this.notesAdminService.reject(note.id), 'notes_manage.rejected');
  }

  markSpam(note: AdminNote): void {
    this.runAction(note, this.notesAdminService.markSpam(note.id), 'notes_manage.marked_spam');
  }

  delete(note: AdminNote): void {
    if (!confirm(this.t.instant('notes_manage.confirm_delete'))) return;
    this.runAction(note, this.notesAdminService.remove(note.id), 'notes_manage.deleted');
  }

  private runAction(note: AdminNote, request$: Observable<unknown>, successKey: string): void {
    this.actioningId = note.id;
    request$.pipe(
      finalize(() => { this.actioningId = null; this.cdr.markForCheck(); }),
    ).subscribe({
      next: () => {
        this.snackBar.open(this.t.instant(successKey), this.t.instant('common.close'), { duration: 2500 });
        // Reload rather than patch locally: a moderation action can change
        // whether the note still belongs in the tab currently shown (e.g.
        // approving a pending note removes it from "pending" but it should
        // still appear, updated, under "approved" or "all").
        this.load();
      },
      error: () => {
        this.snackBar.open(this.t.instant('notes_manage.action_error'), this.t.instant('common.close'), { duration: 3000 });
      },
    });
  }
}
