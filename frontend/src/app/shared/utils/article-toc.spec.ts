import { describe, expect, it } from 'vitest';
import { applyHeadingIds, extractToc, headingText, slugifyHeading } from './article-toc';

describe('slugifyHeading', () => {
  it('drops accents and punctuation', () => {
    expect(slugifyHeading('Perché è più veloce?')).toBe('perche-e-piu-veloce');
    expect(slugifyHeading('  Ëmri & Çështja  ')).toBe('emri-ceshtja');
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugifyHeading('???')).toBe('');
  });
});

describe('headingText', () => {
  it('strips tags and decodes entities', () => {
    expect(headingText('<strong>Angular</strong> &amp; <code>RxJS</code>&nbsp;oggi')).toBe('Angular & RxJS oggi');
    expect(headingText('l&#39;idea &#x2014; fine')).toBe("l'idea — fine");
  });
});

describe('extractToc', () => {
  it('lists h2/h3 in document order with their level, ignoring other headings', () => {
    const html = '<h1>Titolo</h1><h2>Intro</h2><p>x</p><h3 class="a">Dettaglio</h3><h4>No</h4><h2>Fine</h2>';
    expect(extractToc(html)).toEqual([
      { id: 'intro', text: 'Intro', level: 2 },
      { id: 'dettaglio', text: 'Dettaglio', level: 3 },
      { id: 'fine', text: 'Fine', level: 2 },
    ]);
  });

  it('de-duplicates ids of headings with the same text', () => {
    const ids = extractToc('<h2>Esempio</h2><h2>Esempio</h2><h3>Esempio</h3>').map(e => e.id);
    expect(ids).toEqual(['esempio', 'esempio-2', 'esempio-3']);
  });

  it('keeps an id already written by the author', () => {
    expect(extractToc('<h2 id="setup">Installazione</h2>')[0].id).toBe('setup');
  });

  it('skips empty headings and falls back to a generic id for symbol-only ones', () => {
    expect(extractToc('<h2> </h2><h2><br></h2><h2>???</h2>')).toEqual([{ id: 'sezione', text: '???', level: 2 }]);
  });

  it('handles null/empty content and multi-line headings', () => {
    expect(extractToc(null)).toEqual([]);
    expect(extractToc('<H2>\n  Riga\n  doppia\n</H2>')).toEqual([{ id: 'riga-doppia', text: 'Riga doppia', level: 2 }]);
  });
});

describe('applyHeadingIds', () => {
  it('assigns the toc ids to the rendered headings, skipping the same empty ones', () => {
    const html = '<h2>Intro</h2><h2></h2><h3>Dettaglio</h3><h2>Intro</h2>';
    const root = document.createElement('div');
    root.innerHTML = html;
    const applied = applyHeadingIds(root, extractToc(html));
    expect(applied.map(h => h.id)).toEqual(['intro', 'dettaglio', 'intro-2']);
    expect(applied.every(h => h.tabIndex === -1)).toBe(true);
    expect(root.querySelectorAll('h2')[1].id).toBe('');
  });

  it('leaves extra headings alone when the entries run out', () => {
    const root = document.createElement('div');
    root.innerHTML = '<h2>A</h2><h2>B</h2>';
    expect(applyHeadingIds(root, extractToc('<h2>A</h2>')).length).toBe(1);
    expect(root.querySelectorAll('h2')[1].id).toBe('');
  });
});
