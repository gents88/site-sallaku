import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { loadStylesheetOnce } from '../../../core/utils/load-stylesheet';
import { MATERIAL_CSS } from '../../../core/utils/vendor-css.generated';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <main class="admin-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; padding-top: var(--navbar-height, 72px); }
    .admin-main { min-height: calc(100vh - var(--navbar-height, 72px)); }
  `],
})
export class AdminShellComponent implements OnInit {
  ngOnInit(): void {
    // Every route that renders a themed Material component (form fields,
    // chips, expansion panels, snackbars) sits under this shell, so this is
    // the one place the theme has to arrive. Public pages use only
    // <mat-icon>, which needs the self-hosted font and no theme CSS —
    // keeping ~108KB off their critical path.
    void loadStylesheetOnce(MATERIAL_CSS);
  }
}
