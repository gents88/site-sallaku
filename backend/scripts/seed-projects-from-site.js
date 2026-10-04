#!/usr/bin/env node
/**
 * Importa nel CMS i 5 progetti oggi scritti a mano sul sito (card statiche di
 * home e /projects), con titoli, descrizioni e funzionalità già tradotti nei
 * file i18n delle 7 lingue. Dopo l'import il sito mostra i progetti del CMS e
 * ognuno ha la sua pagina /projects/<slug>, modificabile da /dashboard/projects.
 *
 * Nessun contenuto inventato: le funzionalità elencate sulle card diventano la
 * sezione "La soluzione" del case study; "Il problema" e "I risultati" restano
 * vuoti, da compilare in admin.
 *
 * Uso (dalla cartella backend/):
 *   node scripts/seed-projects-from-site.js                 # prova a vuoto: stampa cosa farebbe
 *   MONGODB_URI=... node scripts/seed-projects-from-site.js --apply
 *
 * Idempotente: un progetto con lo stesso slug già presente viene saltato.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const slugify = require('slugify');

const I18N_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'i18n');
const LANGS = ['it', 'en', 'sq', 'es', 'pt', 'fr', 'de'];

/** Stesso ordine e stesse tecnologie delle card statiche (home.component.ts, projects-list.component.ts). */
const STATIC_PROJECTS = [
  { key: 'geo', technologies: ['Cesium.js', 'Angular', 'TypeScript'] },
  { key: 'vr', technologies: ['Photo Sphere', 'Angular', 'WebGL'] },
  { key: 'dash', technologies: ['Looker', 'Angular', 'Chart.js'] },
  { key: 'lib', technologies: ['Angular', 'Node.js', 'PostgreSQL'] },
  { key: 'ins', technologies: ['Angular', '.NET', 'API'] },
];

function loadI18n() {
  return Object.fromEntries(
    LANGS.map((lang) => [lang, JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${lang}.json`), 'utf8'))]),
  );
}

/** Funzionalità della card come elenco puntato: diventano "La soluzione". */
function featuresText(entry) {
  return ['f1', 'f2', 'f3', 'f4']
    .map((f) => entry?.[f])
    .filter((t) => typeof t === 'string' && t.trim())
    .map((t) => `• ${t.trim()}`)
    .join('\n');
}

function buildProjects(i18n) {
  return STATIC_PROJECTS.map((p, order) => {
    const it = i18n.it.projects[p.key];
    if (!it?.title || !it?.desc) throw new Error(`Testi italiani mancanti per projects.${p.key}`);
    const translations = {};
    for (const lang of LANGS.filter((l) => l !== 'it')) {
      const tr = i18n[lang]?.projects?.[p.key];
      if (!tr) continue;
      translations[lang] = { title: tr.title, description: tr.desc, solution: featuresText(tr) };
    }
    return {
      title: it.title,
      slug: slugify(it.title, { lower: true, strict: true }),
      description: it.desc,
      solution: featuresText(it),
      problem: '',
      results: '',
      technologies: p.technologies,
      images: [],
      featured: true,
      order,
      translations,
    };
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const projects = buildProjects(loadI18n());

  if (!apply) {
    console.log('Prova a vuoto (nessuna scrittura). Progetti che verrebbero creati:\n');
    for (const p of projects) {
      console.log(`- [${p.order}] ${p.title}  →  /projects/${p.slug}`);
      console.log(`    tecnologie: ${p.technologies.join(', ')} | traduzioni: ${Object.keys(p.translations).join(', ')}`);
    }
    console.log('\nPer scrivere: MONGODB_URI=... node scripts/seed-projects-from-site.js --apply');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI non impostata');
  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('projects');
  let created = 0;
  for (const p of projects) {
    if (await collection.findOne({ slug: p.slug })) {
      console.log(`= già presente, saltato: ${p.slug}`);
      continue;
    }
    const now = new Date();
    await collection.insertOne({ ...p, createdAt: now, updatedAt: now });
    created++;
    console.log(`+ creato: ${p.slug}`);
  }
  console.log(`\nFatto: ${created} creati, ${projects.length - created} già presenti.`);
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { buildProjects, loadI18n, featuresText };
