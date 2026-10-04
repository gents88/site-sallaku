import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminNotificationsService } from '../../../core/services/admin-notifications.service';
import { NavIconComponent } from '../nav-icon/nav-icon.component';

/** Campanello admin in navbar: cosa aspetta un'azione, con link diretti. */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [DatePipe, RouterLink, TranslateModule, NavIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="nb-trigger" (click)="toggle()"
            [attr.aria-expanded]="open()" aria-controls="nb-panel" aria-haspopup="true"
            [attr.aria-label]="('notifications.label' | translate) + (notifications.total() ? ': ' + notifications.total() : '')">
      <app-nav-icon name="bell" [size]="20" />
      @if (notifications.total()) {
        <span class="nb-badge" aria-hidden="true">{{ notifications.total() > 99 ? '99+' : notifications.total() }}</span>
      }
    </button>

    @if (open()) {
      <div id="nb-panel" class="nb-panel" role="dialog" [attr.aria-label]="'notifications.label' | translate">
        <h2 class="nb-title">{{ 'notifications.label' | translate }}</h2>
        <ul class="nb-list">
          @for (row of rows(); track row.key) {
            <li>
              <a [routerLink]="row.route" class="nb-row" [class.nb-row--urgent]="row.urgent && row.count > 0" (click)="close()">
                <span>{{ row.labelKey | translate }}</span>
                <strong>{{ row.count }}</strong>
              </a>
            </li>
          }
        </ul>
        @if (notifications.recent().length) {
          <h3 class="nb-subtitle">{{ 'notifications.recent' | translate }}</h3>
          <ul class="nb-recent">
            @for (n of notifications.recent(); track n.at + n.type) {
              <li>
                <span class="nb-type">{{ ('notifications.type_' + n.type) | translate }}</span>
                @if (n.title) { <span class="nb-recent__title">{{ n.title }}</span> }
                <time [attr.datetime]="n.at">{{ n.at | date: 'HH:mm' }}</time>
              </li>
            }
          </ul>
        } @else if (!notifications.total()) {
          <p class="nb-empty">{{ 'notifications.empty' | translate }}</p>
        }
        @if (!notifications.connected()) {
          <p class="nb-offline">{{ 'notifications.offline' | translate }}</p>
        }
      </div>
    }
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .nb-trigger {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent; color: var(--text-primary); cursor: pointer;
      &:hover { background: rgba(127,127,127,.12); }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; }
    }
    .nb-badge {
      position: absolute; top: 3px; right: 2px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 999px;
      background: #ef4444; color: #fff; font-size: .68rem; font-weight: 700; line-height: 18px; text-align: center;
    }
    .nb-panel {
      position: absolute; top: calc(100% + 8px); right: 0; z-index: 1300; width: min(320px, calc(100vw - 24px));
      padding: 1rem; border-radius: 16px; background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, #30363d); box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    .nb-title { font-size: 1rem; margin: 0 0 .5rem; }
    .nb-subtitle { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-secondary); margin: 1rem 0 .4rem; }
    .nb-list, .nb-recent { list-style: none; margin: 0; padding: 0; }
    .nb-row {
      display: flex; justify-content: space-between; padding: .55rem .6rem; border-radius: 10px; color: var(--text-primary); text-decoration: none; font-size: .9rem;
      &:hover, &:focus-visible { background: rgba(79,106,245,.1); }
      strong { font-variant-numeric: tabular-nums; }
    }
    .nb-row--urgent strong { color: #ef4444; }
    .nb-recent li { display: flex; gap: .5rem; align-items: baseline; font-size: .82rem; padding: .3rem .6rem; }
    .nb-type { font-weight: 600; white-space: nowrap; }
    .nb-recent__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
    .nb-recent time { color: var(--text-secondary); }
    .nb-empty, .nb-offline { font-size: .82rem; color: var(--text-secondary); margin: .75rem .6rem 0; }
  `],
})
export class NotificationBellComponent {
  readonly notifications = inject(AdminNotificationsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly open = signal(false);

  readonly rows = computed(() => {
    const s = this.notifications.summary();
    return [
      { key: 'live', labelKey: 'notifications.live_waiting', count: s.liveHandoffsWaiting, route: '/dashboard', urgent: true },
      { key: 'contacts', labelKey: 'notifications.contacts_unread', count: s.contactsUnread, route: '/dashboard/contacts', urgent: false },
      { key: 'testimonials', labelKey: 'notifications.testimonials_pending', count: s.testimonialsPending, route: '/dashboard/testimonials', urgent: false },
      { key: 'notes', labelKey: 'notifications.notes_pending', count: s.notesPending, route: '/dashboard/notes', urgent: false },
    ];
  });

  toggle(): void {
    this.open.update(v => !v);
    if (this.open()) this.notifications.refresh();
  }

  close(): void {
    this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
