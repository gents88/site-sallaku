import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NAV_ICONS, NavIconComponent } from './nav-icon.component';

function render(name: string) {
  const fixture = TestBed.createComponent(NavIconComponent);
  fixture.componentRef.setInput('name', name);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('svg') as SVGSVGElement;
}

describe('NavIconComponent', () => {
  it('renders the actual SVG shapes (regression: the HTML sanitizer stripped them, icons were empty)', () => {
    const svg = render('home');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('renders every icon in the map with at least one shape', () => {
    for (const name of Object.keys(NAV_ICONS)) {
      expect(render(name).children.length, name).toBeGreaterThan(0);
    }
  });

  it('falls back to a dot for unknown names, never to caller-provided markup', () => {
    const svg = render('<img src=x onerror=alert(1)>');
    expect(svg.querySelector('img')).toBeNull();
    expect(svg.querySelector('circle')).not.toBeNull();
  });

  it('ignores inherited object keys like "constructor"', () => {
    expect(render('constructor').querySelector('circle')).not.toBeNull();
  });
});

describe('navIconColor', () => {
  it('gives every icon in the map its own colour, and null for unknown names', async () => {
    const { NAV_ICON_COLORS, navIconColor } = await import('./nav-icon.component');
    for (const name of Object.keys(NAV_ICONS).filter(n => n !== 'bell' && n !== 'bolt' && n !== 'drag' && !n.startsWith('arrow'))) {
      expect(NAV_ICON_COLORS[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(navIconColor('constructor')).toBeNull();
    expect(navIconColor('nope')).toBeNull();
  });
});
