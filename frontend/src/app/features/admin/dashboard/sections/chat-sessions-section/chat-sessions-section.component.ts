import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService, ChatbotSession } from '../../admin-dashboard.service';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';

/** Prima domanda dell'utente, tagliata a 60 caratteri: l'anteprima della conversazione. */
export function sessionPreview(session: ChatbotSession): string {
  const first = session.messages.find(m => m.role === 'user');
  if (!first) return '—';
  return first.content.length > 60 ? first.content.slice(0, 60) + '…' : first.content;
}

/** Conversazioni del chatbot di oggi: si caricano a richiesta, una pagina alla volta. */
@Component({
  selector: 'app-chat-sessions-section',
  standalone: true,
  imports: [DatePipe, MatIconModule, TranslateModule, DashboardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-sessions-section.component.html',
  styleUrls: ['./chat-sessions-section.component.scss'],
})
export class ChatSessionsSectionComponent {
  private readonly service = inject(AdminDashboardService);

  /** Interazioni di oggi (dall'overview), per il contatore sul pulsante */
  readonly interactionsToday = input(0);

  readonly sessions = signal<ChatbotSession[]>([]);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly loading = signal(false);
  readonly expandedId = signal<string | null>(null);

  readonly sessionPreview = sessionPreview;

  load(page = 1): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.service.getTodaySessions(page).subscribe({
      next: ({ data, page: p, totalPages }) => {
        this.sessions.set(data);
        this.page.set(p);
        this.totalPages.set(totalPages);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  toggle(sessionId: string): void {
    this.expandedId.update(id => (id === sessionId ? null : sessionId));
  }
}
