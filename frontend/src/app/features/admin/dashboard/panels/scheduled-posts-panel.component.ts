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
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    a.sp-title { color: inherit; font-weight: 600; text-decoration: none; }
    a.sp-title:hover { text-decoration: underline; }
  `],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      @if (posts.length) {
        <ul class="panel-list">
          @for (p of posts; track p._id) {
            <li>
              <span class="panel-list__main">
                <a class="sp-title panel-ellipsis" [routerLink]="'/dashboard/blog'" [queryParams]="{ edit: p._id }">{{ p.title }}</a>
                <time class="panel-sub" [attr.datetime]="p.scheduledAt">{{ p.scheduledAt | date: 'EEE dd/MM HH:mm' }}</time>
              </span>
              @if (p.notifySubscribers) {
                <span class="panel-badge panel-badge--ok">{{ 'scheduled_posts.notify' | translate }}</span>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="panel-empty">{{ 'scheduled_posts.none' | translate }}</p>
      }
      <div class="panel-actions">
        <a class="panel-btn" [routerLink]="'/dashboard/blog'" [queryParams]="{ new: 1 }">{{ 'scheduled_posts.new_post' | translate }}</a>
      </div>
    }
  `,
})
export class ScheduledPostsPanelComponent {
  @Input({ required: true }) posts: ScheduledPost[] = [];
  @Input() failed = false;
}
