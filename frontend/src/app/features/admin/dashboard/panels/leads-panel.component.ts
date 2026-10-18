import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LEAD_STATUSES, LeadStats } from '../admin-dashboard.service';

/** "oggi" o "in ritardo", confrontando i giorni nel fuso del browser. */
export function followUpLabel(iso: string, now = new Date()): 'overdue' | 'today' {
  const d = new Date(iso);
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay || d.getTime() > now.getTime() ? 'today' : 'overdue';
}

/** Pipeline dei contatti, tempo di prima risposta e follow-up da fare. */
@Component({
  selector: 'app-leads-panel',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    a.lead-link { color: inherit; text-decoration: none; display: block; }
    a.lead-link:hover strong { text-decoration: underline; }
    .panel-kpi a { color: inherit; text-decoration: none; }
  `],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-kpis">
        @for (s of statuses; track s) {
          <a class="panel-kpi" [class.panel-kpi--ok]="s === 'won' && data.byStatus.won > 0" [routerLink]="'/dashboard/contacts'" [queryParams]="{ status: s }">
            <strong>{{ data.byStatus[s] }}</strong>
            <span>{{ 'leads.status_' + s | translate }}</span>
          </a>
        }
      </div>

      <div class="panel-kpis">
        <div class="panel-kpi">
          <strong>{{ data.avgFirstResponseHours !== null ? data.avgFirstResponseHours + ' h' : '—' }}</strong>
          <span>{{ (data.avgFirstResponseHours !== null ? 'leads.avg_response' : 'leads.no_replies') | translate }}</span>
        </div>
        <div class="panel-kpi">
          <strong>{{ data.winRate !== null ? data.winRate + '%' : '—' }}</strong>
          <span>{{ 'leads.win_rate' | translate }}</span>
        </div>
      </div>

      <h3 class="panel-section-title">{{ 'leads.followups_due' | translate }} ({{ data.followUpsDue }})</h3>
      @if (data.followUps.length) {
        <ul class="panel-list">
          @for (f of data.followUps; track f._id) {
            <li>
              <a class="lead-link panel-list__main" [routerLink]="'/dashboard/contacts'" [queryParams]="{ q: f.subject }">
                <strong class="panel-ellipsis">{{ f.name }}</strong>
                <span class="panel-sub panel-ellipsis">{{ f.subject }}</span>
              </a>
              <span class="panel-badge" [class.panel-badge--bad]="label(f.followUpAt) === 'overdue'" [class.panel-badge--warn]="label(f.followUpAt) === 'today'">
                {{ label(f.followUpAt) === 'today' ? ('leads.due_today' | translate) : (f.followUpAt | date: 'dd/MM') + ' · ' + ('leads.overdue' | translate) }}
              </span>
            </li>
          }
        </ul>
        @if (data.followUpsDue > data.followUps.length) {
          <div class="panel-actions">
            <a class="panel-btn" [routerLink]="'/dashboard/contacts'" [queryParams]="{ followups: 1 }">{{ 'leads.open_followups' | translate }}</a>
          </div>
        }
      } @else {
        <p class="panel-empty">{{ 'leads.followups_none' | translate }}</p>
      }
    }
  `,
})
export class LeadsPanelComponent {
  @Input({ required: true }) data!: LeadStats;
  @Input() failed = false;
  readonly statuses = LEAD_STATUSES;
  readonly label = (iso: string) => followUpLabel(iso);
}
