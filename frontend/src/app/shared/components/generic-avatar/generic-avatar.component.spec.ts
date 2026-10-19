import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { GenericAvatarComponent } from './generic-avatar.component';

describe('GenericAvatarComponent', () => {
  it('disegna una sagoma decorativa, senza foto', () => {
    const fixture = TestBed.createComponent(GenericAvatarComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('img')).toBeNull();
  });
});
