import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NewsletterAdminService, NewsletterCampaign } from '../../../../core/services/newsletter-admin.service';
import { AuthService } from '../../../../core/services/auth.service';

/** Ogni quanto rinfrescare la lista mentre una campagna è programmata o in invio. */
const POLL_MS = 10_000;

/**
 * Campagne newsletter: bozza → prova → invio subito o programmato, con
 * avanzamento. L'invio vero avviene lato server a lotti (coda su MongoDB),
 * quindi chiudere la pagina non lo interrompe.
 */
@Component({
  selector: 'app-newsletter-campaigns',
  standalone: true,
  imports: [DatePipe, FormsModule, TranslateModule],
  templateUrl: './newsletter-campaigns.component.html',
  styleUrl: './newsletter-campaigns.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsletterCampaignsComponent {
  private readonly api = inject(NewsletterAdminService);
  private readonly auth = inject(AuthService);
  private readonly t = inject(TranslateService);

  readonly campaigns = signal<NewsletterCampaign[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly busy = signal(false);
  readonly message = signal<{ key: string; params?: Record<string, unknown>; error?: boolean } | null>(null);

  /** Editor: null = chiuso, '' = nuova bozza, id = modifica. */
  readonly editingId = signal<string | null>(null);
  readonly subject = signal('');
  readonly html = signal('');
  readonly testEmail = signal(this.auth.currentUser()?.email ?? '');
  readonly scheduleAt = signal('');

  readonly hasActive = computed(() => this.campaigns().some(c => c.status === 'scheduled' || c.status === 'sending'));

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.load();
    this.pollTimer = setInterval(() => {
      if (this.hasActive() && !document.hidden) this.load(true);
    }, POLL_MS);
    inject(DestroyRef).onDestroy(() => {
      if (this.pollTimer) clearInterval(this.pollTimer);
    });
  }

  progress(c: NewsletterCampaign): number {
    return c.stats.total ? Math.round(((c.stats.sent + c.stats.failed) / c.stats.total) * 100) : 0;
  }

  newDraft(): void {
    this.editingId.set('');
    this.subject.set('');
    this.html.set('');
  }

  edit(c: NewsletterCampaign): void {
    this.editingId.set(c._id);
    this.subject.set(c.subject);
    this.html.set(c.html);
  }

  closeEditor(): void {
    this.editingId.set(null);
  }

  saveDraft(): void {
    const id = this.editingId();
    const body = { subject: this.subject().trim(), html: this.html() };
    if (id === null || body.subject.length < 3 || body.html.trim().length < 10) {
      this.message.set({ key: 'newsletter_campaigns.err_incomplete', error: true });
      return;
    }
    this.run(id ? this.api.updateCampaign(id, body) : this.api.createCampaign(body), saved => {
      this.editingId.set(saved._id);
      this.message.set({ key: 'newsletter_campaigns.saved' });
    });
  }

  sendTest(c: NewsletterCampaign): void {
    const email = this.testEmail().trim();
    if (!email) return;
    this.run(this.api.testCampaign(c._id, email), res =>
      this.message.set(res.success
        ? { key: 'newsletter_campaigns.test_sent', params: { email } }
        : { key: 'newsletter_campaigns.test_failed', error: true }),
    );
  }

  send(c: NewsletterCampaign, scheduled: boolean): void {
    const at = scheduled ? this.scheduleAt() : '';
    if (scheduled && (!at || new Date(at).getTime() <= Date.now())) {
      this.message.set({ key: 'newsletter_campaigns.err_schedule_past', error: true });
      return;
    }
    const key = scheduled ? 'newsletter_campaigns.confirm_schedule' : 'newsletter_campaigns.confirm_send';
    if (!confirm(this.t.instant(key, { subject: c.subject }))) return;
    this.run(this.api.sendCampaign(c._id, scheduled ? new Date(at).toISOString() : undefined), updated => {
      this.editingId.set(null);
      this.message.set({ key: 'newsletter_campaigns.queued', params: { count: updated.stats.total } });
    });
  }

  cancel(c: NewsletterCampaign): void {
    if (!confirm(this.t.instant('newsletter_campaigns.confirm_cancel', { subject: c.subject }))) return;
    this.run(this.api.cancelCampaign(c._id), () => this.message.set({ key: 'newsletter_campaigns.cancelled' }));
  }

  remove(c: NewsletterCampaign): void {
    if (!confirm(this.t.instant('newsletter_campaigns.confirm_delete', { subject: c.subject }))) return;
    this.run(this.api.deleteCampaign(c._id), () => {
      if (this.editingId() === c._id) this.editingId.set(null);
    });
  }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.api.listCampaigns().subscribe({
      next: list => {
        this.campaigns.set(list);
        this.loading.set(false);
        this.loadError.set(false);
      },
      error: () => {
        this.loading.set(false);
        if (!silent) this.loadError.set(true);
      },
    });
  }

  /** Esegue un'azione, mostra l'errore del server se fallisce, poi ricarica la lista. */
  private run<T>(obs: import('rxjs').Observable<T>, onSuccess: (value: T) => void): void {
    this.busy.set(true);
    this.message.set(null);
    obs.subscribe({
      next: value => {
        this.busy.set(false);
        onSuccess(value);
        this.load(true);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.busy.set(false);
        const msg = err?.error?.message;
        this.message.set({ key: (Array.isArray(msg) ? msg.join(' ') : msg) || 'newsletter_campaigns.action_error', error: true });
      },
    });
  }
}
