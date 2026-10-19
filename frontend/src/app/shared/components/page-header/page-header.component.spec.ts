import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

@Component({
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <app-page-header title="Contatti" titleId="contact-title" lead="Scrivimi">
      <p class="extra">50 articoli</p>
    </app-page-header>
    <app-page-header class="bare" title="Solo titolo" />
  `,
})
class HostComponent {}

describe('PageHeaderComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('rende titolo, sottotitolo, id per aria-labelledby e contenuto proiettato', () => {
    const el = render();
    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toBe('Contatti');
    expect(h1.id).toBe('contact-title');
    expect(el.querySelector('.page-header__lead')?.textContent).toBe('Scrivimi');
    expect(el.querySelector('.page-header .extra')?.textContent).toBe('50 articoli');
  });

  it('senza eyebrow, sottotitolo e id non lascia elementi vuoti', () => {
    const bare = render().querySelector('.bare')!;
    expect(bare.querySelector('.page-header__eyebrow')).toBeNull();
    expect(bare.querySelector('.page-header__lead')).toBeNull();
    expect(bare.querySelector('h1')?.hasAttribute('id')).toBe(false);
  });
});
