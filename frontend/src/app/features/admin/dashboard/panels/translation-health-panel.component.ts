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
  styleUrls: ['./panel-shared.scss', './translation-health-panel.component.scss'],
  templateUrl: './translation-health-panel.component.html',
})
export class TranslationHealthPanelComponent {
  @Input({ required: true }) data!: TranslationHealth;
  @Input() failed = false;
  readonly label = issueLabel;
}
