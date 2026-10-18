import { describe, expect, it } from 'vitest';
import { extractChatLinks } from './chat-links';

describe('extractChatLinks', () => {
  it('riconosce un tool del Lab citato nel testo e usa etichetta e icona del registro', () => {
    const links = extractChatLinks('Prova il riassunto: /lab/pdf-summary, fa tutto in pochi secondi.');

    expect(links).toEqual([{ path: '/lab/pdf-summary', icon: 'summary', labelKey: 'sidebar.items.pdf_summary' }]);
  });

  it('accetta path tra parentesi, URL completi e prefisso lingua', () => {
    const links = extractChatLinks(
      'Vedi (/lab/ocr) oppure https://gentsallaku.it/en/contact o ancora /de/projects.',
    );

    expect(links.map((l) => l.path)).toEqual(['/lab/ocr', '/contact', '/projects']);
  });

  it('articoli e progetti: etichetta dallo slug e tipo', () => {
    const links = extractChatLinks('Ne parla in /blog/come-ottimizzare-angular e in /projects/dashboard-3d.');

    expect(links).toEqual([
      { path: '/blog/come-ottimizzare-angular', icon: 'article', label: 'Come ottimizzare angular', kindKey: 'chatbot_ui.link_blog' },
      { path: '/projects/dashboard-3d', icon: 'grid', label: 'Dashboard 3d', kindKey: 'chatbot_ui.link_project' },
    ]);
  });

  it('ignora i path che non esistono nel sito (niente card verso una 404)', () => {
    expect(extractChatLinks('Usa /lab/strumento-inventato per farlo.')).toEqual([]);
  });

  it('non scambia pezzi di altri URL per path del sito', () => {
    expect(extractChatLinks('Vedi https://github.com/gent/lab/ocr e a/b/blog')).toEqual([]);
  });

  it('niente doppioni e al massimo tre card', () => {
    const links = extractChatLinks('/lab/ocr /lab/ocr /lab/viewer /lab/editor /lab/convert /contact');

    expect(links.map((l) => l.path)).toEqual(['/lab/ocr', '/lab/viewer', '/lab/editor']);
  });

  it('testo senza link: nessuna card', () => {
    expect(extractChatLinks('Gent lavora con Angular da molti anni.')).toEqual([]);
  });
});
