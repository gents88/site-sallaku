import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

export interface BreadcrumbItem {
  label: string;
  /** Relative path for routerLink (via langUrl). Omit on the last item — it renders as the current page, not a link. */
  path?: string;
}

/**
 * Visible "Home / Page" trail. Pairs with SeoService.breadcrumb() for the
 * JSON-LD twin — pass the same labels/order to both so the visible trail
 * matches what's declared to search engines.
 */
@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [CommonModule, RouterLink, LangUrlPipe],
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
})
export class BreadcrumbComponent {
  @Input({ required: true }) items: BreadcrumbItem[] = [];
}
