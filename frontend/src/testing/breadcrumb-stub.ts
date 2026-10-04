import { Component, input } from '@angular/core';
import type { BreadcrumbItem } from '../app/shared/components/breadcrumb/breadcrumb.component';

/**
 * Sostituto di BreadcrumbComponent per gli unit test che finto-mockano il
 * Router: il breadcrumb vero usa RouterLink, che richiede ActivatedRoute e un
 * Router reale (events, createUrlTree) e faceva fallire l'intera suite.
 */
@Component({ selector: 'app-breadcrumb', standalone: true, template: '' })
export class BreadcrumbStubComponent {
  readonly items = input<BreadcrumbItem[]>([]);
}
