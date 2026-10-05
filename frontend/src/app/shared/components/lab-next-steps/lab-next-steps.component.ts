import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter } from 'rxjs';
import { WorkspaceItem, WorkspaceService } from '../../../core/services/workspace.service';
import { isLabIndexUrl, labToolsAccepting, workspaceInput } from '../../../core/navigation/lab-tools';
import { NavIconComponent, navIconColor } from '../nav-icon/nav-icon.component';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

const MAX_STEPS = 4;

/**
 * Dopo un "Invia al workspace" propone subito dove continuare (es. OCR →
 * Traduci, Riassumi, Formatta): prima l'utente doveva sapere da solo quale
 * strumento avrebbe accettato il risultato e andarci a mano.
 * Sparisce alla navigazione successiva — lì è il tool di destinazione a
 * mostrare il proprio banner "usa il file dal workspace".
 */
@Component({
  selector: 'app-lab-next-steps',
  standalone: true,
  imports: [RouterLink, TranslateModule, NavIconComponent, LangUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (item(); as it) {
      @if (steps().length) {
        <aside class="next-steps" role="status" aria-live="polite">
          <p class="next-steps__text">
            <span aria-hidden="true">✓</span>
            {{ 'lab_next.ready' | translate: { name: it.filename } }}
            <span class="next-steps__label">{{ 'lab_next.continue_with' | translate }}</span>
          </p>
          <div class="next-steps__links">
            @for (step of steps(); track step.id) {
              <a [routerLink]="step.route | langUrl" class="next-steps__chip">
                <span class="icon-tile" aria-hidden="true" [style.--icon-color]="iconColor(step.icon)"><app-nav-icon [name]="step.icon" [size]="14" /></span>
                {{ (step.searchTitleKey ?? step.labelKey) | translate }}
              </a>
            }
          </div>
          <button type="button" class="next-steps__close" (click)="dismiss()" [attr.aria-label]="'lab_next.close' | translate">×</button>
        </aside>
      }
    }
  `,
  styles: [`
    .next-steps {
      position: fixed;
      left: 50%;
      bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
      transform: translateX(-50%);
      z-index: 1040;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 0.75rem;
      width: max-content;
      max-width: min(760px, calc(100vw - 2rem));
      padding: 0.75rem 2.5rem 0.75rem 1rem;
      border-radius: var(--radius-md, 12px);
      background: var(--color-bg-alt, #0f1424);
      color: var(--color-text, #f1f5f9);
      border: 1px solid var(--color-border);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
      animation: next-in 0.25s ease-out;
    }
    @media (max-width: 900px) {
      .next-steps { bottom: calc(var(--bottom-tabbar-height, 60px) + 0.75rem + env(safe-area-inset-bottom, 0px)); }
    }
    .next-steps__text { margin: 0; font-size: 0.875rem; }
    .next-steps__text > span[aria-hidden] { color: var(--color-success, #10b981); font-weight: 700; margin-right: 0.25rem; }
    .next-steps__label { color: var(--color-text-muted); margin-left: 0.25rem; }
    .next-steps__links { display: flex; flex-wrap: wrap; gap: 0.4rem; }
    .next-steps__chip {
      display: inline-flex; align-items: center; gap: 0.35rem;
      padding: 0.3rem 0.65rem 0.3rem 0.35rem;
      border-radius: 999px;
      border: 1px solid var(--color-border);
      color: var(--color-text);
      font-size: 0.8rem;
      text-decoration: none;
      transition: border-color 0.15s;
    }
    .next-steps__chip:hover, .next-steps__chip:focus-visible { border-color: var(--color-primary); }
    .next-steps__close {
      position: absolute; top: 0.35rem; right: 0.5rem;
      background: none; border: none; color: var(--color-text-muted);
      font-size: 1.3rem; line-height: 1; cursor: pointer; padding: 0.25rem;
    }
    @keyframes next-in { from { opacity: 0; transform: translate(-50%, 10px); } }
    @media (prefers-reduced-motion: reduce) { .next-steps { animation: none; } }
  `],
})
export class LabNextStepsComponent {
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  readonly iconColor = navIconColor;
  /** Ultimo elemento inviato durante questa visita (null = barra chiusa). */
  readonly item = signal<WorkspaceItem | null>(null);
  readonly steps = computed(() => {
    const it = this.item();
    return it ? labToolsAccepting(workspaceInput(it), it.fromTool).slice(0, MAX_STEPS) : [];
  });

  constructor() {
    // Solo gli invii successivi al montaggio: un elemento già presente al
    // caricamento è gestito dal banner del tool e dalla pagina /lab.
    let lastSeen = untracked(() => this.workspace.current()?.createdAt ?? 0);
    effect(() => {
      const current = this.workspace.current();
      if (!current || current.createdAt === lastSeen) return;
      lastSeen = current.createdAt;
      // Sulla pagina /lab gli stessi suggerimenti sono già nel riquadro "Continua da dove eri rimasto".
      if (isLabIndexUrl(untracked(() => this.router.url))) return;
      this.item.set(current);
    });
    const sub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.item.set(null));
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
  }

  dismiss(): void {
    this.item.set(null);
  }
}
