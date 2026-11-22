import * as fs from 'fs';
import * as path from 'path';
import { LAB_CATALOG } from './lab-catalog';
import { buildLabBlock, selectPostsForPrompt } from './chatbot-context';

const generator = path.join(__dirname, '..', '..', 'scripts', 'build-lab-catalog.js');
const frontendPresent = fs.existsSync(path.join(__dirname, '..', '..', '..', 'frontend', 'src', 'app', 'core', 'navigation', 'nav-registry.json'));

describe('catalogo strumenti del chatbot', () => {
  (frontendPresent ? it : it.skip)('è aggiornato rispetto al registro di navigazione (rilancia node scripts/build-lab-catalog.js)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildCatalog } = require(generator);
    expect(JSON.parse(JSON.stringify(LAB_CATALOG))).toEqual(buildCatalog());
  });

  it('contiene gli strumenti nuovi e le pagine scorciatoia con il loro strumento', () => {
    const byPath = Object.fromEntries(LAB_CATALOG.map((e) => [e.path, e]));
    expect(byPath['/lab/sign-pdf']).toBeDefined();
    expect(byPath['/lab/qr-code']).toBeDefined();
    expect(byPath['/lab/heic-to-jpg']).toMatchObject({ shortcut: true, parent: '/lab/image-tools' });
    expect(byPath['/lab/png-to-jpg']).toMatchObject({ shortcut: true, parent: '/lab/convert' });
  });
});

describe('buildLabBlock', () => {
  it('elenca gli strumenti principali ma non tutte le scorciatoie', () => {
    const block = buildLabBlock('');
    expect(block).toContain('(/lab/compress-pdf)');
    expect(block).toContain('(/lab/qr-code)');
    expect(block).not.toContain('(/lab/heic-to-jpg)');
    expect(block).not.toContain('Pages most relevant');
  });

  it("aggiunge le pagine pertinenti all'ultimo messaggio, anche in italiano", () => {
    const block = buildLabBlock('come converto le foto heic dell iphone in jpg?');
    expect(block).toContain('Pages most relevant');
    expect(block).toMatch(/\(\/lab\/heic-to-jpg\) — preset of \/lab\/image-tools/);
  });

  it('dice quali conversioni caricano il file sul server e quali no', () => {
    const block = buildLabBlock('');
    const serverLine = block.split('\n').find((l) => l.includes('upload the file to the server')) as string;
    expect(serverLine).toContain('/lab/convert');
    expect(serverLine).toContain('/lab/pdf-to-jpg');
    expect(serverLine).not.toContain('/lab/heic-to-jpg');
    expect(block).toContain('run locally in the browser');
  });

  it("indica dove fare domande a un documento", () => {
    expect(buildLabBlock('')).toContain('/lab/viewer');
  });
});

describe('selectPostsForPrompt', () => {
  const posts = Array.from({ length: 30 }, (_, i) => ({ title: `Articolo ${i}`, slug: `a-${i}`, excerpt: 'testo generico' }));
  posts.push({ title: 'Come condividere il Wi-Fi con un QR code', slug: 'wifi-qr', excerpt: 'guida' });

  it('trova un articolo pertinente anche se è molto vecchio (oltre i più recenti)', () => {
    const picked = selectPostsForPrompt(posts, 'voglio un qr code per il wifi');
    expect(picked[0].slug).toBe('wifi-qr');
    expect(picked).toHaveLength(8);
  });

  it('senza corrispondenze restano i più recenti', () => {
    const picked = selectPostsForPrompt(posts, 'ciao');
    expect(picked.map((p) => p.slug)).toEqual(posts.slice(0, 8).map((p) => p.slug));
  });
});
