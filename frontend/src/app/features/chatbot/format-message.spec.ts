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

  it('trasforma gli elenchi puntati e numerati in liste vere', () => {
    expect(formatChatMessage('Due modi:\n- **uno**\n- due\nFine')).toBe('Due modi:<ul><li><strong>uno</strong></li><li>due</li></ul>Fine');
    expect(formatChatMessage('1. primo\n2) secondo')).toBe('<ol><li>primo</li><li>secondo</li></ol>');
    expect(formatChatMessage('* a\n• b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('negli elenchi l\'HTML iniettato resta escapato e il codice in linea si formatta', () => {
    expect(formatChatMessage('- <img src=x onerror=1> `/lab/qr-code`')).toBe('<ul><li>&lt;img src=x onerror=1&gt; <code>/lab/qr-code</code></li></ul>');
  });

  it('un trattino a metà frase non è un elenco', () => {
    expect(formatChatMessage('PDF - molto utile')).toBe('PDF - molto utile');
  });

  it('testo vuoto resta vuoto', () => {
    expect(formatChatMessage('')).toBe('');
  });
});
