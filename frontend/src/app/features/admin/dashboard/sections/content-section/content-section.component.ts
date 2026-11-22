import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NotFoundSummary, OverviewSection, ScheduledPost, SecuritySummary, TranslationHealth } from '../../admin-dashboard.service';
import { DashboardCardComponent } from '../../components/dashboard-card/dashboard-card.component';
import { TranslationHealthPanelComponent } from '../../panels/translation-health-panel.component';
import { ScheduledPostsPanelComponent } from '../../panels/scheduled-posts-panel.component';
import { NotFoundPanelComponent } from '../../panels/not-found-panel.component';
import { SecurityPanelComponent } from '../../panels/security-panel.component';

/** Contenuti e sicurezza: traduzioni, pubblicazioni programmate, link rotti, accessi. */
@Component({
  selector: 'app-content-section',
  standalone: true,
  imports: [
    TranslateModule, DashboardCardComponent,
    TranslationHealthPanelComponent, ScheduledPostsPanelComponent, NotFoundPanelComponent, SecurityPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './content-section.component.html',
  styleUrls: ['./content-section.component.scss'],
})
export class ContentSectionComponent {
  readonly translationHealth = input.required<TranslationHealth>();
  readonly scheduledPosts = input<ScheduledPost[]>([]);
  readonly notFound = input.required<NotFoundSummary>();
  readonly security = input.required<SecuritySummary>();
  readonly failed = input<ReadonlySet<OverviewSection>>(new Set());
  readonly changed = output<void>();
}
