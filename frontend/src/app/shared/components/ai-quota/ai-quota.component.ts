import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AiQuotaService } from '../../../core/services/ai-quota.service';

/** Sotto questa soglia di richieste rimaste il contatore passa in evidenza. */
export const AI_QUOTA_LOW_THRESHOLD = 5;

/**
 * "Ti restano N richieste AI oggi" per i tool che chiamano l'AI. Compare solo
 * quando lo stato è noto, così un errore di rete non lascia un riquadro vuoto.
 */
@Component({
  selector: 'app-ai-quota',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view(); as v) {
      <p class="aiq" [class.aiq--low]="v.kind === 'low'" [class.aiq--out]="v.kind === 'out' || v.kind === 'unavailable'" role="status">
        <span class="aiq__icon" aria-hidden="true">{{ v.kind === 'ok' ? '✦' : '⚠' }}</span>
        <span class="aiq__text">{{ v.key | translate: v.params }}</span>
        @if (v.kind === 'ok' || v.kind === 'low') {
          <span class="aiq__bar" aria-hidden="true"><span class="aiq__fill" [style.width.%]="v.percent"></span></span>
        }
      </p>
    }
  `,
  styles: [`
    .aiq {
      display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .6rem;
      margin: .75rem 0 .5rem; padding: .45rem .8rem; border-radius: 10px;
      font-size: .85rem; line-height: 1.4;
      color: var(--text-secondary, #9aa4b2);
      background: var(--bg-card, rgba(255, 255, 255, .04));
      border: 1px solid var(--border-color, rgba(255, 255, 255, .1));
    }
    .aiq__icon { color: var(--color-primary, #8b5cf6); }
    .aiq__bar { flex: 0 0 80px; height: 4px; border-radius: 4px; background: var(--border-color, rgba(255, 255, 255, .12)); overflow: hidden; }
    .aiq__fill { display: block; height: 100%; background: var(--color-primary, #8b5cf6); border-radius: 4px; }
    .aiq--low { color: var(--text-primary, #e6edf3); border-color: var(--color-warning, #f59e0b); background: rgba(245, 158, 11, .1); }
    .aiq--low .aiq__icon, .aiq--low .aiq__fill { color: var(--color-warning, #f59e0b); background: transparent; }
    .aiq--low .aiq__fill { background: var(--color-warning, #f59e0b); }
    .aiq--out { color: var(--text-primary, #e6edf3); border-color: var(--color-danger, #ef4444); background: rgba(239, 68, 68, .1); }
    .aiq--out .aiq__icon { color: var(--color-danger, #ef4444); }
  `],
})
export class AiQuotaComponent {
  private readonly quota = inject(AiQuotaService);

  readonly view = computed(() => {
    const s = this.quota.status();
    if (!s) return null;
    if (s.unavailable) return { kind: 'unavailable' as const, key: 'ai_quota.unavailable', params: {}, percent: 0 };
    if (s.remaining <= 0) return { kind: 'out' as const, key: 'ai_quota.exhausted', params: { time: formatResetTime(s.resetsAt) }, percent: 0 };
    const percent = s.limit > 0 ? Math.round((s.remaining / s.limit) * 100) : 0;
    const key = s.remaining === 1 ? 'ai_quota.remaining_one' : 'ai_quota.remaining';
    return { kind: s.remaining <= AI_QUOTA_LOW_THRESHOLD ? ('low' as const) : ('ok' as const), key, params: { remaining: s.remaining, limit: s.limit }, percent };
  });

  constructor() {
    this.quota.refresh();
  }
}

/** Ora locale del reset (i contatori ripartono a mezzanotte UTC), es. "01:00". */
export function formatResetTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
