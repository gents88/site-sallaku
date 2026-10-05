import { Component, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  ViewTransitionNameDirective,
  ViewTransitionNameOnClickDirective,
  claimViewTransitionName,
} from './view-transition-name.directive';

const vtName = (el: Element | null) => (el as HTMLElement | null)?.style.getPropertyValue('view-transition-name') ?? '';

describe('claimViewTransitionName', () => {
  it('moves the name to the new element, removing it from the previous owner', () => {
    const a = document.createElement('h3');
    const b = document.createElement('h1');
    document.body.append(a, b);
    claimViewTransitionName(a, 'post-title');
    claimViewTransitionName(b, 'post-title');
    expect(vtName(a)).toBe('');
    expect(a.hasAttribute('data-vt-name')).toBe(false);
    expect(vtName(b)).toBe('post-title');
    a.remove();
    b.remove();
  });

  it('leaves elements with a different name alone', () => {
    const a = document.createElement('h3');
    const b = document.createElement('h1');
    document.body.append(a, b);
    claimViewTransitionName(a, 'project-title');
    claimViewTransitionName(b, 'post-title');
    expect(vtName(a)).toBe('project-title');
    a.remove();
    b.remove();
  });
});

@Component({
  standalone: true,
  imports: [ViewTransitionNameDirective, ViewTransitionNameOnClickDirective],
  template: `
    <h1 appVtName="post-title">Dettaglio</h1>
    <article class="one" appVtNameOnClick="post-title" vtTarget=".t"><h2 class="t">Uno</h2><a>Leggi</a></article>
    <article class="two" appVtNameOnClick="post-title"><h2>Due</h2></article>
  `,
})
class HostComponent {}

describe('view transition directives', () => {
  function render(platform: 'browser' | 'server') {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
    const fixture = TestBed.createComponent(HostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('names the destination on render, and hands the name to the clicked card target', () => {
    const el = render('browser');
    const h1 = el.querySelector('h1');
    expect(vtName(h1)).toBe('post-title');

    el.querySelector<HTMLElement>('.one a')!.click();
    expect(vtName(el.querySelector('.one .t'))).toBe('post-title');
    expect(vtName(h1)).toBe('');

    el.querySelector<HTMLElement>('.two')!.click();
    expect(vtName(el.querySelector('.two'))).toBe('post-title');
    expect(vtName(el.querySelector('.one .t'))).toBe('');
    el.remove();
  });

  it('does not touch the DOM while prerendering', () => {
    const el = render('server');
    expect(vtName(el.querySelector('h1'))).toBe('');
    el.remove();
  });
});
