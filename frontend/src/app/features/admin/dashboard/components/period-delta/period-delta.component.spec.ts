import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { PeriodDeltaComponent } from './period-delta.component';
import { periodDelta } from '../../dashboard-metrics';

describe('periodDelta', () => {
  it('calcola la variazione percentuale e la direzione', () => {
    expect(periodDelta(118, 100)).toEqual({ pct: 18, direction: 'up' });
    expect(periodDelta(50, 100)).toEqual({ pct: -50, direction: 'down' });
    expect(periodDelta(7, 7)).toEqual({ pct: 0, direction: 'flat' });
  });

  it('senza periodo precedente non inventa una percentuale', () => {
    expect(periodDelta(5, 0)).toEqual({ pct: null, direction: 'up' });
    expect(periodDelta(0, 0)).toEqual({ pct: null, direction: 'flat' });
  });
});

describe('PeriodDeltaComponent', () => {
  function render(current: number, previous: number) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(PeriodDeltaComponent);
    fixture.componentRef.setInput('current', current);
    fixture.componentRef.setInput('previous', previous);
    fixture.componentRef.setInput('days', 30);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.delta') as HTMLElement;
  }

  it('mostra +18% in verde quando cresce', () => {
    const el = render(118, 100);
    expect(el.textContent).toContain('+18%');
    expect(el.classList).toContain('delta--up');
  });

  it('mostra la percentuale negativa in rosso quando cala', () => {
    const el = render(50, 100);
    expect(el.textContent).toContain('-50%');
    expect(el.classList).toContain('delta--down');
  });
});
