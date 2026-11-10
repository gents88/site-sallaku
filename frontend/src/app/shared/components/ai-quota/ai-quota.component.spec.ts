import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { AiQuotaComponent, AI_QUOTA_LOW_THRESHOLD, formatResetTime } from './ai-quota.component';
import { AiQuotaService, AiQuotaStatus } from '../../../core/services/ai-quota.service';

const base: AiQuotaStatus = { limit: 30, used: 0, remaining: 30, resetsAt: '2026-11-11T00:00:00.000Z', unavailable: false };

function setup(initial: AiQuotaStatus | null) {
  const status = signal<AiQuotaStatus | null>(initial);
  const refresh = vi.fn();
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [{ provide: AiQuotaService, useValue: { status, refresh } }],
  });
  TestBed.inject(TranslateService).setTranslation('it', {
    ai_quota: {
      remaining: 'rimaste {{remaining}} su {{limit}}',
      remaining_one: 'ne resta 1 su {{limit}}',
      exhausted: 'finite, rinnovo alle {{time}}',
      unavailable: 'servizio al limite',
    },
  });
  TestBed.inject(TranslateService).use('it');
  const fixture = TestBed.createComponent(AiQuotaComponent);
  fixture.detectChanges();
  const el = () => fixture.nativeElement.querySelector('.aiq') as HTMLElement | null;
  const render = () => { TestBed.tick(); fixture.detectChanges(); };
  return { status, refresh, el, render };
}

describe('AiQuotaComponent', () => {
  it('rilegge la quota quando compare', () => {
    expect(setup(null).refresh).toHaveBeenCalledTimes(1);
  });

  it('non mostra nulla finché lo stato non è noto', () => {
    expect(setup(null).el()).toBeNull();
  });

  it('mostra richieste rimaste e limite, senza stato d’allarme se ce ne sono molte', () => {
    const { el } = setup({ ...base, used: 4, remaining: 26 });
    expect(el()?.textContent).toContain('rimaste 26 su 30');
    expect(el()?.classList.contains('aiq--low')).toBe(false);
  });

  it('usa il singolare quando ne resta una sola ed è in evidenza', () => {
    const { el } = setup({ ...base, used: 29, remaining: 1 });
    expect(el()?.textContent).toContain('ne resta 1 su 30');
    expect(el()?.classList.contains('aiq--low')).toBe(true);
  });

  it(`passa in evidenza esattamente a ${AI_QUOTA_LOW_THRESHOLD} rimaste, non a ${AI_QUOTA_LOW_THRESHOLD + 1}`, () => {
    const { status, el, render } = setup({ ...base, remaining: AI_QUOTA_LOW_THRESHOLD + 1 });
    expect(el()?.classList.contains('aiq--low')).toBe(false);
    status.set({ ...base, remaining: AI_QUOTA_LOW_THRESHOLD });
    render();
    expect(el()?.classList.contains('aiq--low')).toBe(true);
  });

  it('a quota esaurita spiega quando si rinnova, con l’ora locale', () => {
    const { el } = setup({ ...base, used: 30, remaining: 0 });
    expect(el()?.classList.contains('aiq--out')).toBe(true);
    expect(el()?.textContent).toContain(`rinnovo alle ${formatResetTime(base.resetsAt)}`);
  });

  it('con il budget globale esaurito lo dice anche se all’utente restano richieste', () => {
    const { el } = setup({ ...base, remaining: 20, unavailable: true });
    expect(el()?.textContent).toContain('servizio al limite');
    expect(el()?.classList.contains('aiq--out')).toBe(true);
  });
});

describe('formatResetTime', () => {
  it('data non valida: stringa vuota, non "Invalid Date"', () => {
    expect(formatResetTime('boh')).toBe('');
  });
});
