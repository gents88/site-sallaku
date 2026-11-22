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
  styleUrls: ['./panel-shared.scss', './leads-panel.component.scss'],
  templateUrl: './leads-panel.component.html',
})
export class LeadsPanelComponent {
  @Input({ required: true }) data!: LeadStats;
  @Input() failed = false;
  readonly statuses = LEAD_STATUSES;
  readonly label = (iso: string) => followUpLabel(iso);
}
