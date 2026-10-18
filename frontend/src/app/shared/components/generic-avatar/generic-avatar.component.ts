import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Avatar neutro (sagoma di una persona) per chi non è Gent: nelle card di
 * login prende il posto di app-profile-photo finché non si sa che ad
 * accedere è l'admin. Riempie il contenitore tondo come la foto e segue il
 * tema tramite le variabili colore. Decorativo, come la foto.
 */
@Component({
  selector: 'app-generic-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle class="head" cx="32" cy="25" r="11" />
      <path class="body" d="M8 66c0-14.4 10.7-25 24-25s24 10.6 24 25z" />
    </svg>
  `,
  styles: [`
    :host, svg { display: block; width: 100%; height: 100%; }
    svg {
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-primary) 14%, var(--color-surface));
    }
    .head, .body { fill: color-mix(in srgb, var(--color-primary) 45%, var(--color-text-muted)); }
  `],
})
export class GenericAvatarComponent {}
