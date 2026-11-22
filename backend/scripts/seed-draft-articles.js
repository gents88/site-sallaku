#!/usr/bin/env node
/**
 * Inserisce nel CMS le bozze di articolo sugli strumenti del Lab (cartella draft-articles/):
 * Wi-Fi con QR code, ridurre il peso di un PDF, foto HEIC in JPG, firmare un PDF.
 *
 * Gli articoli entrano SEMPRE come bozza: published=false, nessuna data di pubblicazione,
 * nessuna programmazione, nessun invio alla newsletter. Non diventano pubblici finché non li
 * pubblichi tu da /dashboard/blog. Sono solo in italiano: le traduzioni si generano dall'admin.
 *
 * Uso (dalla cartella backend/):
 *   node scripts/seed-draft-articles.js                 # prova a vuoto: stampa cosa farebbe
 *   MONGODB_URI=... node scripts/seed-draft-articles.js --apply
 *
 * Idempotente: un articolo con lo stesso slug già presente viene saltato, mai sovrascritto.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'draft-articles');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Formattazione dentro una riga: **grassetto**, *corsivo*, `codice`, [testo](link). Il testo è già escapato. */
function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
      // Solo link relativi del sito o https: niente javascript: o altri schemi.
      const safe = /^(\/[^/]|https:\/\/)/.test(href) ? href : '#';
      return `<a href="${safe}">${label}</a>`;
    });
}

/** Markdown (sottoinsieme usato nelle bozze: titoli ##, paragrafi, elenchi, tabelle) → HTML. */
function markdownToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\|.*\|\s*$/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(
        '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table>',
      );
      continue;
    }

    const ul = /^[-*]\s+/;
    const ol = /^\d+\.\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items = [];
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].replace(re, '')); i++; }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
      continue;
    }

    // Paragrafo: righe consecutive fino a una riga vuota o a un altro blocco.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|[-*]\s|\d+\.\s|\|)/.test(lines[i])) { para.push(lines[i].trim()); i++; }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    else i++;
  }
  return out.join('\n');
}

/** Legge una bozza: intestazione con titolo e metadati, poi il corpo fino alla riga delle note. */
function parseDraft(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const title = (/^#\s+(.+)$/m.exec(raw) || [])[1];
  const field = (label) => (new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm').exec(raw) || [])[1];
  const slug = (field('Slug') || '').replace(/`/g, '').trim();
  const subtitle = field('Sottotitolo');
  const excerpt = field('Excerpt \\(meta description\\)');
  const tags = (field('Tag') || '').split(',').map((t) => t.trim()).filter(Boolean);
  const parts = raw.split(/^---\s*$/m);
  // parts[0] = intestazione, parts[1] = corpo, parts[2] = note di lavorazione (non pubblicate)
  const body = (parts[1] || '').trim();
  if (!title || !slug || !excerpt || !body) throw new Error(`${path.basename(file)}: titolo, slug, excerpt o corpo mancanti`);
  return { title, slug, subtitle: subtitle || '', excerpt, tags, content: markdownToHtml(body) };
}

function loadDrafts() {
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort().map((f) => parseDraft(path.join(DIR, f)));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const drafts = loadDrafts();

  if (!apply) {
    console.log('Prova a vuoto (nessuna scrittura). Bozze che verrebbero inserite:\n');
    for (const d of drafts) {
      console.log(`- ${d.slug}\n  titolo: ${d.title}\n  tag: ${d.tags.join(', ')}\n  contenuto: ${d.content.length} caratteri HTML, stato: BOZZA`);
    }
    console.log('\nPer scrivere: MONGODB_URI=... node scripts/seed-draft-articles.js --apply');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI non impostata');
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  const posts = mongoose.connection.collection('posts');
  const now = new Date();
  let inserted = 0;
  for (const d of drafts) {
    if (await posts.findOne({ slug: d.slug })) { console.log(`= ${d.slug}: già presente, saltato`); continue; }
    await posts.insertOne({
      title: d.title, subtitle: d.subtitle, slug: d.slug,
      slug_en: '', slug_sq: '', slug_pt: '', slug_es: '', slug_fr: '', slug_de: '',
      content: d.content, excerpt: d.excerpt, language: 'it', coverImage: '', tags: d.tags,
      published: false, publishedAt: null, scheduledAt: null, notifySubscribers: false,
      title_en: '', content_en: '', excerpt_en: '', title_sq: '', content_sq: '', excerpt_sq: '',
      title_pt: '', content_pt: '', excerpt_pt: '', title_es: '', content_es: '', excerpt_es: '',
      title_fr: '', content_fr: '', excerpt_fr: '', title_de: '', content_de: '', excerpt_de: '',
      metaTitle: d.title, metaDescription: d.excerpt,
      viewCount: 0, sourceUpdatedAt: now, translationsUpdatedAt: {},
      createdAt: now, updatedAt: now,
    });
    inserted++;
    console.log(`+ ${d.slug}: inserito come BOZZA`);
  }
  await mongoose.disconnect();
  console.log(`\nFatto: ${inserted} inserite, ${drafts.length - inserted} già presenti.`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { markdownToHtml, parseDraft, loadDrafts };
