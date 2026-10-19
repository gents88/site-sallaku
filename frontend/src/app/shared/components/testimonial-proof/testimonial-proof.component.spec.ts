import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { TestimonialProofComponent } from './testimonial-proof.component';

@Component({
  standalone: true,
  imports: [TestimonialProofComponent],
  template: `<app-testimonial-proof [verified]="verified" [linkedinUrl]="linkedinUrl" [name]="'Mario Rossi'" />`,
})
class HostComponent {
  verified: boolean | undefined = false;
  linkedinUrl: string | undefined;
}

function render(verified: boolean | undefined, linkedinUrl?: string) {
  TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.verified = verified;
  fixture.componentInstance.linkedinUrl = linkedinUrl;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const LINK = 'https://www.linkedin.com/in/mario-rossi';

describe('TestimonialProofComponent', () => {
  it('non verificata: né badge né link, anche se arriva un URL', () => {
    const el = render(false, LINK);
    expect(el.querySelector('.tp__badge')).toBeNull();
    expect(el.querySelector('.tp__link')).toBeNull();
  });

  it('campo assente (testimonianza vecchia): nulla', () => {
    const el = render(undefined);
    expect(el.querySelector('.tp')).toBeNull();
  });

  it('verificata con LinkedIn: badge e link che si apre in modo sicuro', () => {
    const el = render(true, LINK);
    expect(el.querySelector('.tp__badge')).not.toBeNull();
    const a = el.querySelector('a.tp__link') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe(LINK);
    expect(a.getAttribute('target')).toBe('_blank');
    const rel = a.getAttribute('rel') ?? '';
    for (const token of ['nofollow', 'ugc', 'noopener', 'noreferrer']) expect(rel).toContain(token);
  });

  it('verificata senza LinkedIn: solo il badge', () => {
    const el = render(true);
    expect(el.querySelector('.tp__badge')).not.toBeNull();
    expect(el.querySelector('.tp__link')).toBeNull();
  });

  it('verificata ma con un link che non è un profilo LinkedIn: niente link (difesa in profondità)', () => {
    for (const bad of ['javascript:alert(1)', 'https://evil.example/in/mario-rossi', 'https://linkedin.com.evil.example/in/mario-rossi']) {
      const el = render(true, bad);
      expect(el.querySelector('.tp__link'), bad).toBeNull();
      expect(el.querySelector('.tp__badge'), bad).not.toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('il badge ha un\'etichetta testuale e l\'icona è decorativa', () => {
    const el = render(true, LINK);
    expect(el.querySelector('.tp__badge')?.textContent?.trim().length).toBeGreaterThan(0);
    expect(el.querySelector('.tp__badge svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.tp__link i')?.getAttribute('aria-hidden')).toBe('true');
  });
});
