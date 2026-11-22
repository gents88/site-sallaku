import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ScheduledPost } from '../admin-dashboard.service';

/** Prossimi articoli in uscita da soli (BlogSchedulerService, controllo ogni minuto). */
@Component({
  selector: 'app-scheduled-posts-panel',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss', './scheduled-posts-panel.component.scss'],
  templateUrl: './scheduled-posts-panel.component.html',
})
export class ScheduledPostsPanelComponent {
  @Input({ required: true }) posts: ScheduledPost[] = [];
  @Input() failed = false;
}
