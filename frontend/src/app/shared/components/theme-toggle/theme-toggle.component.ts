import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ThemeService } from '../../../core/services/theme.service';
import { NavIconComponent } from '../nav-icon/nav-icon.component';

const ICONS = { light: 'sun', dark: 'moon', system: 'monitor' } as const;
const NEXT = { light: 'dark', dark: 'system', system: 'light' } as const;

/**
 * Tre stati: chiaro → scuro → sistema. Prima era solo chiaro/scuro: chi
 * sceglieva una volta perdeva per sempre l'adeguamento automatico al tema
 * del sistema operativo. Icone SVG (il font Material è un subset fisso).
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslateModule, NavIconComponent],
  template: `
    <button type="button" class="tt" (click)="theme.cycle()"
            [attr.aria-label]="('theme.current_' + theme.preference()) | translate: { next: (nextKey() | translate) }"
            [title]="('theme.current_' + theme.preference()) | translate: { next: (nextKey() | translate) }">
      <app-nav-icon [name]="icon()" [size]="20" />
    </button>
  `,
  styles: [`
    .tt {
      display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
      border: none; border-radius: 50%; background: transparent; color: var(--text-primary); cursor: pointer;
      &:hover { background: rgba(127,127,127,.12); }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; }
    }
  `],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
  readonly icon = computed(() => ICONS[this.theme.preference()]);
  readonly nextKey = computed(() => `theme.name_${NEXT[this.theme.preference()]}`);
}
