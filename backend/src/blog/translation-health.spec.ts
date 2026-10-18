import { analyzePost, structureCounts, structureDiff, summarizeTranslationHealth } from './translation-health';

const IT = `<h2>Titolo</h2><p>${'Testo italiano. '.repeat(40)}</p><pre><code>a</code></pre><pre class="x"><code>b</code></pre><ul><li>uno</li><li>due</li></ul>`;
const GOOD = `<h2>Title</h2><p>${'English text here. '.repeat(36)}</p><pre><code>a</code></pre><pre class="x"><code>b</code></pre><ul><li>one</li><li>two</li></ul>`;

function fullPost(overrides: Record<string, unknown> = {}) {
  const post: Record<string, unknown> = { _id: 'p1', title: 'Titolo', slug: 'titolo', published: true, content: IT };
  for (const l of ['en', 'sq', 'pt', 'es', 'fr', 'de']) {
    post[`title_${l}`] = `Title ${l}`;
    post[`content_${l}`] = GOOD;
  }
  return { ...post, ...overrides } as Parameters<typeof analyzePost>[0];
}

describe('structureCounts / structureDiff', () => {
  it('conta i tag strutturali senza confondere <pre> con <prefix> o <li> con <link>', () => {
    const c = structureCounts('<pre>x</pre><prefix></prefix><li>a</li><link rel="x"><img src="a"/>');
    expect(c.pre).toBe(1);
    expect(c.li).toBe(1);
    expect(c.img).toBe(1);
  });

  it('segnala un blocco <pre> perso e un testo troncato', () => {
    const broken = GOOD.replace('<pre class="x"><code>b</code></pre>', '');
    expect(structureDiff(IT, broken)).toEqual(['pre 1/2']);
    expect(structureDiff(IT, '<h2>T</h2><p>corto</p><pre></pre><pre></pre><ul><li></li><li></li></ul>')).toEqual(['length']);
  });

  it('non segnala nulla per una traduzione fedele', () => {
    expect(structureDiff(IT, GOOD)).toEqual([]);
  });
});

describe('analyzePost', () => {
  it('traduzione mancante se manca il titolo o il contenuto', () => {
    const issues = analyzePost(fullPost({ title_de: '', content_fr: '  ' }));
    expect(issues).toEqual([{ lang: 'fr', kind: 'missing' }, { lang: 'de', kind: 'missing' }]);
  });

  it('non aggiornata se tradotta prima dell’ultima modifica all’italiano', () => {
    const issues = analyzePost(fullPost({
      sourceUpdatedAt: '2026-10-10T10:00:00Z',
      translationsUpdatedAt: { en: '2026-10-11T10:00:00Z', sq: '2026-10-01T10:00:00Z' },
    }));
    expect(issues).toEqual([{ lang: 'sq', kind: 'stale' }]);
  });

  it('senza date (post vecchi) non inventa traduzioni non aggiornate', () => {
    expect(analyzePost(fullPost())).toEqual([]);
  });

  it('segnala la struttura diversa con il dettaglio', () => {
    const issues = analyzePost(fullPost({ content_sq: GOOD.replace('<li>two</li>', '') }));
    expect(issues).toEqual([{ lang: 'sq', kind: 'structure', detail: ['li 1/2'] }]);
  });
});

describe('summarizeTranslationHealth', () => {
  it('conta per lingua e tipo, mette prima i pubblicati con più problemi', () => {
    const s = summarizeTranslationHealth([
      fullPost({ _id: 'ok' }),
      fullPost({ _id: 'draft', published: false, title_en: '', title_es: '' }),
      fullPost({ _id: 'live', title_en: '' }),
    ]);
    expect(s.posts).toBe(3);
    expect(s.postsWithIssues).toBe(2);
    expect(s.missing).toBe(3);
    expect(s.byLang.en.missing).toBe(2);
    expect(s.items.map((i) => i._id)).toEqual(['live', 'draft']);
  });
});
