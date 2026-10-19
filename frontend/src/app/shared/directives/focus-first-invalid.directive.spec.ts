import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { FocusFirstInvalidDirective } from './focus-first-invalid.directive';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, FocusFirstInvalidDirective],
  template: `
    <form appFocusFirstInvalid [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <input id="trap" type="text" formControlName="trap" aria-hidden="true" tabindex="-1" />
      <input id="name" type="text" formControlName="name" />
      <input id="email" type="email" formControlName="email" />
      <textarea id="message" formControlName="message"></textarea>
      <button type="submit">Invia</button>
    </form>
  `,
})
class HostComponent {
  submitted = 0;
  form = inject(FormBuilder).group({
    trap: ['', Validators.required],
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    message: ['', Validators.required],
  });
  submit() { this.submitted++; }
}

async function submitForm(setup?: (cmp: HostComponent) => void) {
  const fixture = TestBed.createComponent(HostComponent);
  document.body.appendChild(fixture.nativeElement);
  setup?.(fixture.componentInstance);
  fixture.detectChanges();
  const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await Promise.resolve();
  fixture.detectChanges();
  return { fixture, active: document.activeElement as HTMLElement | null };
}

describe('FocusFirstInvalidDirective', () => {
  it('porta il focus sul primo campo non valido, saltando il campo nascosto (honeypot)', async () => {
    const { fixture, active } = await submitForm();
    expect(active?.id).toBe('name');
    expect(fixture.componentInstance.submitted).toBe(1);
    fixture.nativeElement.remove();
  });

  it('salta i campi già validi e va al successivo errato', async () => {
    const { fixture, active } = await submitForm(cmp => cmp.form.patchValue({ name: 'Mario', email: 'non-valida' }));
    expect(active?.id).toBe('email');
    fixture.nativeElement.remove();
  });

  it('con tutti i campi validi non sposta il focus', async () => {
    const { fixture, active } = await submitForm(cmp =>
      cmp.form.patchValue({ trap: 'x', name: 'Mario', email: 'm@example.com', message: 'Ciao' }));
    expect(active?.tagName).toBe('BODY');
    fixture.nativeElement.remove();
  });
});
