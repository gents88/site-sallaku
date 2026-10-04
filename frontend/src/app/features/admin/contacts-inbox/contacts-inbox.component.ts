import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AdminDashboardService, RecentContact } from '../dashboard/admin-dashboard.service';

/**
 * Inbox dei messaggi di contatto. Prima i contatti erano visibili solo come
 * "ultimi 10" nella dashboard, e le card Contatti/Utenti puntavano alla
 * dashboard stessa: niente ricerca, niente storico, niente paginazione.
 */
@Component({
  selector: 'app-contacts-inbox',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TranslateModule],
  templateUrl: './contacts-inbox.component.html',
  styleUrl: './contacts-inbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactsInboxComponent {
  private readonly api = inject(AdminDashboardService);
  private readonly t = inject(TranslateService);

  readonly limit = 20;
  readonly page = signal(1);
  readonly unreadOnly = signal(false);
  /** Testo nel campo di ricerca; `query` è la versione con debounce che parte verso il server. */
  readonly search = signal('');
  readonly query = signal('');

  readonly items = signal<RecentContact[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly loading = signal(true);
  readonly loadError = signal(false);

  readonly selected = signal<RecentContact | null>(null);
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly allSelected = computed(() => this.items().length > 0 && this.items().every(c => !!c._id && this.selectedIds().has(c._id)));

  readonly replyText = signal('');
  readonly sending = signal(false);
  readonly feedbackKey = signal<string | null>(null);

  private loadSub: Subscription | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => this.load(this.page(), this.unreadOnly(), this.query()));
    inject(DestroyRef).onDestroy(() => {
      this.loadSub?.unsubscribe();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.query.set(value.trim());
    }, 300);
  }

  setUnreadOnly(value: boolean): void {
    this.page.set(1);
    this.unreadOnly.set(value);
  }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
  }

  reload(): void {
    this.load(this.page(), this.unreadOnly(), this.query());
  }

  open(contact: RecentContact): void {
    this.selected.set(contact);
    this.replyText.set('');
    this.feedbackKey.set(null);
    // Aprire un messaggio non letto lo segna come letto, come in qualsiasi client di posta.
    if (contact._id && !contact.read) this.setRead(contact, true);
  }

  close(): void {
    this.selected.set(null);
  }

  setRead(contact: RecentContact, read: boolean): void {
    if (!contact._id) return;
    this.patchLocal(contact._id, { read });
    this.api.markContactRead(contact._id, read).subscribe({
      error: () => {
        this.patchLocal(contact._id!, { read: !read });
        this.feedbackKey.set('contacts_inbox.action_error');
      },
    });
  }

  sendReply(): void {
    const contact = this.selected();
    const text = this.replyText().trim();
    if (!contact?._id || !text || this.sending()) return;
    this.sending.set(true);
    this.api.replyToContact(contact._id, text).subscribe({
      next: ({ repliedAt }) => {
        this.sending.set(false);
        this.replyText.set('');
        this.patchLocal(contact._id!, { repliedAt, replyText: text, read: true });
        this.feedbackKey.set('admin.reply_sent');
      },
      error: () => {
        this.sending.set(false);
        this.feedbackKey.set('admin.reply_error');
      },
    });
  }

  delete(contact: RecentContact): void {
    if (!contact._id || !confirm(this.t.instant('admin.confirm_delete_message'))) return;
    this.api.deleteContact(contact._id).subscribe({
      next: () => {
        if (this.selected()?._id === contact._id) this.selected.set(null);
        this.reload();
      },
      error: () => this.feedbackKey.set('contacts_inbox.action_error'),
    });
  }

  toggleSelect(id: string | undefined): void {
    if (!id) return;
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.selectedIds.set(next);
  }

  toggleSelectAll(): void {
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.items().flatMap(c => (c._id ? [c._id] : []))));
  }

  deleteSelected(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length || !confirm(this.t.instant('admin.confirm_delete_bulk', { count: ids.length }))) return;
    this.api.bulkDeleteContacts(ids).subscribe({
      next: () => {
        this.selectedIds.set(new Set());
        if (this.selected()?._id && ids.includes(this.selected()!._id!)) this.selected.set(null);
        this.reload();
      },
      error: () => this.feedbackKey.set('contacts_inbox.action_error'),
    });
  }

  private load(page: number, unreadOnly: boolean, q: string): void {
    this.loading.set(true);
    this.loadError.set(false);
    this.loadSub?.unsubscribe();
    this.loadSub = this.api.listContacts({ page, limit: this.limit, unreadOnly, q }).subscribe({
      next: res => {
        this.items.set(res.data);
        this.total.set(res.total);
        this.totalPages.set(Math.max(res.totalPages, 1));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set(true);
      },
    });
  }

  private patchLocal(id: string, patch: Partial<RecentContact>): void {
    this.items.update(list => list.map(c => (c._id === id ? { ...c, ...patch } : c)));
    const sel = this.selected();
    if (sel?._id === id) this.selected.set({ ...sel, ...patch });
  }
}
