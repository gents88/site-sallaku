import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe, NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';
import {
  LiveHandoffHistoryEntry,
  liveHandoffEntryRoute,
  liveHandoffEntryStatusKey,
  responseMinutes,
  splitLiveHandoffs,
} from './live-chat-list.util';

/** Gli stati cambiano anche senza eventi (scadenza e chiusura per inattività le fa un cron). */
export const LIVE_CHAT_LIST_REFRESH_MS = 60_000;

/**
 * Pagina "Live chat": le richieste aperte e quelle delle ultime 24 ore (poi il
 * backend le cancella). Prima l'unico accesso era la card della dashboard, che
 * mostra solo quelle aperte: una chat chiusa per sbaglio non si ritrovava più.
 */
@Component({
  selector: 'app-live-chat-list',
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, UpperCasePipe, RouterLink, MatIconModule, TranslateModule],
  templateUrl: './live-chat-list.component.html',
  styleUrl: './live-chat-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveChatListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AdminNotificationsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entries = signal<LiveHandoffHistoryEntry[]>([]);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly groups = computed(() => splitLiveHandoffs(this.entries()));

  readonly statusKey = liveHandoffEntryStatusKey;
  readonly responseMinutes = responseMinutes;
  readonly route = liveHandoffEntryRoute;

  /** Ultimo evento del campanello già visto: all'apertura non deve scatenare un secondo caricamento. */
  private lastEventAt = this.notifications.recent()[0]?.at ?? null;

  constructor() {
    // Nuova richiesta (o cambio di stato notificato agli admin): ricarica subito.
    effect(() => {
      const latest = this.notifications.recent()[0];
      if (!latest || latest.at === this.lastEventAt) return;
      this.lastEventAt = latest.at;
      if (latest.type === 'live_handoff') untracked(() => this.load());
    });
  }

  ngOnInit(): void {
    this.load();
    const timer = setInterval(() => this.load(), LIVE_CHAT_LIST_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  load(): void {
    this.http.get<LiveHandoffHistoryEntry[]>(`${environment.apiUrl}/admin/live-handoff/recent`).subscribe({
      next: entries => {
        this.entries.set(Array.isArray(entries) ? entries : []);
        this.loadFailed.set(false);
        this.loading.set(false);
      },
      error: () => {
        // Si tengono le righe già mostrate: un errore di rete non deve svuotare la pagina.
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }
}
