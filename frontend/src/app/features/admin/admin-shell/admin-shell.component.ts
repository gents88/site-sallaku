import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

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
export class AdminShellComponent {}
