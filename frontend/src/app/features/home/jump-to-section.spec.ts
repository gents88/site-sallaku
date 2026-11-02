import { afterEach, describe, expect, it, vi } from 'vitest';
import { jumpToSection } from './jump-to-section';

describe('jumpToSection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('porta la sezione in vista in modo istantaneo, non animato', () => {
    document.body.innerHTML = '<section id="about"></section>';
    const target = document.getElementById('about')!;
    target.scrollIntoView = vi.fn();

    jumpToSection(document, 'about');

    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('non fa nulla se la sezione non esiste', () => {
    expect(() => jumpToSection(document, 'inesistente')).not.toThrow();
  });
});
