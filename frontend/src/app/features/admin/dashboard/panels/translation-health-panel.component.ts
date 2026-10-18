import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationHealth, TranslationIssue } from '../admin-dashboard.service';

/** "en ✕" per una mancante, "sq ⟳" per una non aggiornata, "pt ≠" per la struttura diversa. */
export function issueLabel(issue: TranslationIssue): string {
  const mark = issue.kind === 'missing' ? '✕' : issue.kind === 'stale' ? '⟳' : '≠';
  return `${issue.lang.toUpperCase()} ${mark}`;
}

/** Traduzioni mancanti, non aggiornate o con struttura diversa dall'italiano, post per post. */
@Component({
  selector: 'app-translation-health-panel',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./panel-shared.scss'],
  styles: [`
    .tr-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    .tr-row { display: grid !important; gap: 0.4rem; }
    .tr-row a { color: inherit; font-weight: 600; text-decoration: none; }
    .tr-row a:hover { text-decoration: underline; }
    .tr-legend { margin: 0.75rem 0 0; }
  `],
  template: `
    @if (failed) {
      <p class="panel-error" role="alert">{{ 'admin.overview_partial_error' | translate }}</p>
    } @else {
      <div class="panel-kpis">
        <div class="panel-kpi" [class.panel-kpi--bad]="data.missing > 0">
          <strong>{{ data.missing }}</strong>
          <span>{{ 'translation_health.missing' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--warn]="data.stale > 0">
          <strong>{{ data.stale }}</strong>
          <span>{{ 'translation_health.stale' | translate }}</span>
        </div>
        <div class="panel-kpi" [class.panel-kpi--warn]="data.structure > 0">
          <strong>{{ data.structure }}</strong>
          <span>{{ 'translation_health.structure' | translate }}</span>
        </div>
      </div>

      @if (data.items.length) {
        <ul class="panel-list">
          @for (post of data.items; track post._id) {
            <li class="tr-row">
              <span class="panel-ellipsis">
                <a [routerLink]="'/dashboard/blog'" [queryParams]="{ edit: post._id }">{{ post.title }}</a>
                @if (!post.published) {
                  <span class="panel-badge" style="margin-left: 0.4rem">{{ 'admin.drafts' | translate }}</span>
                }
              </span>
              <span class="tr-chips">
                @for (issue of post.issues; track issue.lang + issue.kind) {
                  <span
                    class="panel-badge"
                    [class.panel-badge--bad]="issue.kind === 'missing'"
                    [class.panel-badge--warn]="issue.kind !== 'missing'"
                    [title]="('translation_health.' + issue.kind | translate) + (issue.detail?.length ? ': ' + issue.detail!.join(', ') : '')"
                  >{{ label(issue) }}</span>
                }
              </span>
            </li>
          }
        </ul>
        <p class="panel-sub tr-legend">{{ 'translation_health.legend' | translate }}</p>
      } @else {
        <p class="panel-empty">{{ 'translation_health.all_ok' | translate: { n: data.posts } }}</p>
      }
    }
  `,
})
export class TranslationHealthPanelComponent {
  @Input({ required: true }) data!: TranslationHealth;
  @Input() failed = false;
  readonly label = issueLabel;
}
