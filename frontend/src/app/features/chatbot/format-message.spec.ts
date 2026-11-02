import { describe, expect, it } from 'vitest';
import { formatChatMessage } from './format-message';

describe('formatChatMessage', () => {
  it('rende grassetto, corsivo e a capo', () => {
    expect(formatChatMessage('**ciao** *mondo*\nfine')).toBe('<strong>ciao</strong> <em>mondo</em><br>fine');
  });

  it('esegue l\'escape dell\'HTML iniettato nel testo', () => {
    const html = formatChatMessage('<img src=x onerror=alert(1)> <script>alert(1)</script>');

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('l\'escape non rompe la formattazione dentro il testo', () => {
    expect(formatChatMessage('**<b>x</b>**')).toBe('<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
  });

  it('esegue l\'escape di & una volta sola', () => {
    expect(formatChatMessage('Tom & Jerry &amp; co')).toBe('Tom &amp; Jerry &amp;amp; co');
  });

  it('testo vuoto resta vuoto', () => {
    expect(formatChatMessage('')).toBe('');
  });
});
