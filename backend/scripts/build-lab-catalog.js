#!/usr/bin/env node
/**
 * Genera backend/src/chatbot/lab-catalog.ts: l'elenco degli strumenti del Lab (nome, percorso, descrizione)
 * che il chatbot conosce. La fonte è il registro di navigazione del sito e i testi inglesi, quindi quando
 * si aggiunge uno strumento basta rilanciare questo script invece di riscrivere il prompt a mano
 * (è per questo che il chatbot non conosceva gli strumenti nuovi).
 *
 * Uso (dalla cartella backend/):   node scripts/build-lab-catalog.js
 * Un test (lab-catalog.spec.ts) fallisce se il file generato non è aggiornato rispetto al registro.
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const REGISTRY = path.join(FRONTEND, 'src', 'app', 'core', 'navigation', 'nav-registry.json');
const INTENTS = path.join(FRONTEND, 'src', 'app', 'core', 'navigation', 'lab-intents.ts');
const I18N = path.join(FRONTEND, 'public', 'i18n');
const OTHER_LANGS = ['it', 'es', 'fr', 'de', 'pt', 'sq'];
const OUT = path.join(__dirname, '..', 'src', 'chatbot', 'lab-catalog.ts');

function pick(obj, key) {
  return key ? key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj) : undefined;
}

function buildCatalog() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const items = Array.isArray(registry) ? registry : registry.items;
  const en = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));
  const others = OTHER_LANGS.map((l) => JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), 'utf8')));
  const intentsSrc = fs.readFileSync(INTENTS, 'utf8');
  // 'merge-pdf': { tool: 'pdf-editor', ... }
  const intents = Object.fromEntries([...intentsSrc.matchAll(/'([a-z0-9-]+)':\s*\{\s*tool:\s*'([a-z0-9-]+)'/g)].map((m) => [m[1], m[2]]));
  const routeOf = Object.fromEntries(items.map((i) => [i.id, i.route]));

  const catalog = [];
  for (const i of items) {
    if (!String(i.route || '').startsWith('/lab') || (i.access || 'public') !== 'public') continue;
    const shortcut = Object.prototype.hasOwnProperty.call(intents, i.id);
    const name = pick(en, i.searchTitleKey) || pick(en, i.labelKey);
    const description = (pick(en, i.descKey) || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    // Nomi e descrizioni nelle altre lingue del sito: servono solo alla ricerca (chi scrive "firmare un pdf"
    // deve trovare "Sign PDF"), non finiscono nel prompt.
    const altNames = others.map((o) => pick(o, i.searchTitleKey) || pick(o, i.labelKey)).filter(Boolean);
    const altText = others.map((o) => pick(o, i.descKey)).filter(Boolean);
    const clean = (arr) => [...new Set(arr.map((x) => String(x).replace(/\s+/g, ' ').trim()))].join(' | ');
    const entry = { path: i.route, name: String(name).replace(/\s+/g, ' ').trim(), description, shortcut, altNames: clean(altNames), altText: clean(altText) };
    if (shortcut && routeOf[intents[i.id]]) entry.parent = routeOf[intents[i.id]];
    catalog.push(entry);
  }
  return catalog;
}

function render(catalog) {
  const rows = catalog.map((e) => '  ' + JSON.stringify(e) + ',');
  return `/* Generato da scripts/build-lab-catalog.js: non modificare a mano. */
export interface LabCatalogEntry {
  path: string;
  name: string;
  description: string;
  /** Pagina per una ricerca specifica (es. /lab/heic-to-jpg) che riusa lo strumento in \`parent\`. */
  shortcut: boolean;
  /** Nomi e descrizioni nelle altre lingue, solo per la ricerca. */
  altNames: string;
  altText: string;
  parent?: string;
}

export const LAB_CATALOG: readonly LabCatalogEntry[] = [
${rows.join('\n')}
];
`;
}

if (require.main === module) {
  fs.writeFileSync(OUT, render(buildCatalog()));
  console.log(`Scritto ${path.relative(process.cwd(), OUT)}`);
}

module.exports = { buildCatalog, render };
