import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LAB_RELATIONS, allLabArticleSlugs, labInfoKey, labToolsForArticle, relatedLabArticles, relatedLabTools } from './lab-info.data';
import { LAB_INTENTS } from '../../../core/navigation/lab-intents';
import { NAV_REGISTRY } from '../../../core/navigation/nav-registry';

describe('lab-info.data', () => {
  it('ogni strumento e ogni articolo collegato esiste', () => {
    const toolIds = new Set(NAV_REGISTRY.map(e => e.id));
    for (const [tool, rel] of Object.entries(LAB_RELATIONS)) {
      expect(toolIds.has(tool), `strumento ${tool}`).toBe(true);
      rel.tools.forEach(id => expect(toolIds.has(id), `${tool} → ${id}`).toBe(true));
      for (const lang of ['it', 'en', 'de'] as const) {
        expect(relatedLabArticles(tool, lang).length, `${tool} articoli ${lang}`).toBe(rel.articles.length);
      }
    }
  });

  it('i link agli articoli usano lo slug della lingua e il titolo tradotto', () => {
    const [en] = relatedLabArticles('ocr', 'en');
    expect(en.path).toBe('/blog/ocr-how-to-extract-text-from-scans-and-photos-and-why-it-sometimes-fails');
    expect(en.title.toLowerCase()).toContain('ocr');
    const [it] = relatedLabArticles('ocr', 'it');
    expect(it.path).toBe('/blog/ocr-online-estrarre-testo-da-scansioni-e-foto');
  });

  it('gli strumenti correlati non includono lo strumento stesso', () => {
    for (const tool of Object.keys(LAB_RELATIONS)) {
      expect(relatedLabTools(tool).map(e => e.id)).not.toContain(tool);
    }
  });

  it('la chiave i18n sostituisce i trattini', () => {
    expect(labInfoKey('pdf-editor')).toBe('pdf_editor');
    expect(labInfoKey('ocr')).toBe('ocr');
  });

  it('dall\'articolo si risale agli strumenti', () => {
    expect(labToolsForArticle('ocr-online-estrarre-testo-da-scansioni-e-foto').map(e => e.id)).toEqual(['ocr', 'scanner', 'image-to-text']);
    expect(labToolsForArticle('non-esiste')).toEqual([]);
  });

  // Ogni pagina di strumento deve includere il contenuto informativo e restare una pagina vera:
  // un template ridotto al solo <app-lab-tool-info> (file svuotato per errore) non darebbe errori nei test.
  it('la pagina di ogni strumento include il contenuto informativo e il suo template non è vuoto', () => {
    // Le pagine per ricerca specifica (lab-intents) riusano il componente dello strumento padre.
    const intents = new Set(Object.keys(LAB_INTENTS));
    for (const tool of Object.keys(LAB_RELATIONS).filter(id => !intents.has(id))) {
      const html = readFileSync(resolve(process.cwd(), `src/app/features/admin/${tool}/${tool}.component.html`), 'utf8');
      expect(html, `${tool}: manca <app-lab-tool-info>`).toMatch(new RegExp(`<app-lab-tool-info (tool="${tool}"|\\[tool\\]="page\\.id") />`));
      expect(html.split('\n').length, `${tool}: template quasi vuoto`).toBeGreaterThan(60);
    }
  });

  // Ogni strumento pubblico del Lab (non le pagine per ricerca specifica, che riusano lo strumento padre) deve avere
  // la guida sotto lo strumento, in tutte le lingue: è il testo che Google e le AI leggono e citano.
  it('ogni strumento pubblico ha la guida (descrizione e passaggi) in tutte le lingue', () => {
    const intents = new Set(Object.keys(LAB_INTENTS));
    const tools = NAV_REGISTRY
      .filter(e => e.route.startsWith('/lab/') && e.access === 'public' && !intents.has(e.id) && e.prerender)
      .map(e => labInfoKey(e.id));
    for (const lang of ['it', 'en', 'es', 'fr', 'de', 'pt', 'sq']) {
      const json = JSON.parse(readFileSync(resolve(process.cwd(), `public/i18n/${lang}.json`), 'utf8'));
      for (const tool of tools) {
        const info = json.lab_info?.[tool];
        expect(info?.about, `${lang}/${tool}: manca "about"`).toBeTruthy();
        expect(info?.steps?.length, `${lang}/${tool}: mancano i passaggi`).toBeGreaterThan(0);
      }
    }
  });

  // Se un articolo viene rinominato, il link dagli strumenti si romperebbe in silenzio:
  // lo slug deve comparire nella sitemap, che il bot rigenera a ogni deploy.
  it('ogni slug collegato è nella sitemap pubblicata', () => {
    const sitemap = readFileSync(resolve(process.cwd(), 'public/sitemap.xml'), 'utf8');
    const missing = allLabArticleSlugs().filter(({ slug }) => !sitemap.includes(`/blog/${slug}<`));
    expect(missing).toEqual([]);
  });
});
