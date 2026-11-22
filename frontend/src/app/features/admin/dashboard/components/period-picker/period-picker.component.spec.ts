import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it, vi } from 'vitest';
import { PeriodPickerComponent } from './period-picker.component';

describe('PeriodPickerComponent', () => {
  function setup(days = 30) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(PeriodPickerComponent);
    fixture.componentRef.setInput('days', days);
    const changed = vi.fn();
    fixture.componentInstance.daysChange.subscribe(changed);
    fixture.detectChanges();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    return { buttons, changed };
  }

  it('segna come attivo il periodo scelto', () => {
    const { buttons } = setup(30);
    expect(buttons.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('emette il nuovo periodo, non quello già attivo', () => {
    const { buttons, changed } = setup(30);
    buttons[1].click();
    expect(changed).not.toHaveBeenCalled();
    buttons[2].click();
    expect(changed).toHaveBeenCalledWith(90);
  });
});
