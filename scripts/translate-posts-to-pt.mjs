/**
 * translate-posts-to-pt.mjs
 *
 * Migrazione one-shot: traduce in portoghese tutti i post MongoDB
 * che non hanno ancora title_pt/content_pt/excerpt_pt.
 *
 * Uso (dalla cartella backend/):
 *   MONGODB_URI=mongodb://... node ../scripts/translate-posts-to-pt.mjs
 */

import { MongoClient } from 'mongodb';

// ─── Config ───────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
const COLLECTION  = 'posts';
const FROM_LANG   = 'it';
const TO_LANG     = 'pt';
const CHUNK_MAX   = 2000; // Google unofficial API handles much longer chunks
const DELAY_MS    = 600;  // shorter delay

// ─── Helper: pausa ────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Helper: strip HTML ──────────────────────────────────────────────────────
function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

// ─── Helper: testo → paragrafi HTML ─────────────────────────────────────────
function textToHtml(text = '') {
  return text.split(/\n\n+/).filter(Boolean).map(p => `<p>${p.trim()}</p>`).join('\n');
}

// ─── Suddivide testo in chunk ≤ CHUNK_MAX ────────────────────────────────────
function splitChunks(text) {
  if (text.length <= CHUNK_MAX) return [text];
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  for (const para of paragraphs) {
    if (para.length > CHUNK_MAX) {
      if (current) { chunks.push(current.trim()); current = ''; }
      const sentences = para.match(/[^.!?]+[.!?]+[\s]*/g) ?? [para];
      for (const s of sentences) {
        if ((current + s).length > CHUNK_MAX) {
          if (current) chunks.push(current.trim());
          current = s;
        } else {
          current += s;
        }
      }
    } else if (current && (current + '\n\n' + para).length > CHUNK_MAX) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

// ─── Traduzione via Google Translate (unofficial) ───────────────────────────
async function translate(text, from, to) {
  const safe = (text || '').trim();
  if (!safe) return '';
  const chunks = splitChunks(safe);
  const results = [];
  for (const chunk of chunks) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(chunk)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from Google Translate`);
    const json = await res.json();
    // Response: [[[translatedText, originalText, ...], ...], ...]
    const translated = json[0]?.map(part => part[0]).join('') ?? chunk;
    results.push(translated);
    if (chunks.length > 1) await sleep(DELAY_MS);
  }
  return results.join('\n\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📦 Connessione a MongoDB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//<credentials>@')}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db();
  const col = db.collection(COLLECTION);

  // Prendi tutti i post senza title_pt (o con title_pt vuoto)
  const posts = await col.find({
    $or: [
      { title_pt: { $exists: false } },
      { title_pt: '' },
      { title_pt: null },
    ],
  }).toArray();

  console.log(`🔍 Post da tradurre: ${posts.length}\n`);

  if (posts.length === 0) {
    console.log('✅ Nessun post da aggiornare.');
    await client.close();
    return;
  }

  let ok = 0, errors = 0;

  for (const post of posts) {
    const label = `[${post.slug || post._id}]`;
    console.log(`🌐 ${label} Traduzione in corso…`);

    try {
      // Traduce title (testo semplice)
      const title_pt = await translate(post.title || '', FROM_LANG, TO_LANG);
      await sleep(DELAY_MS);

      // Traduce content (strip HTML → traduce → riwrap in paragrafi)
      const plainContent = stripHtml(post.content || '');
      const contentTranslated = plainContent ? await translate(plainContent, FROM_LANG, TO_LANG) : '';
      const content_pt = contentTranslated ? textToHtml(contentTranslated) : '';
      await sleep(DELAY_MS);

      // Traduce excerpt
      const plainExcerpt = stripHtml(post.excerpt || '');
      const excerpt_pt = plainExcerpt ? await translate(plainExcerpt, FROM_LANG, TO_LANG) : '';
      if (plainExcerpt) await sleep(DELAY_MS);

      await col.updateOne(
        { _id: post._id },
        { $set: { title_pt, content_pt, excerpt_pt } },
      );

      console.log(`   ✅ ${label} OK`);
      ok++;
    } catch (err) {
      console.error(`   ❌ ${label} Errore: ${err.message}`);
      errors++;
      await sleep(2000); // aspetta di più dopo un errore
    }
  }

  await client.close();
  console.log(`\n─────────────────────────────`);
  console.log(`✅ Completati: ${ok} | ❌ Errori: ${errors}`);
  console.log(`─────────────────────────────\n`);
}

main().catch(err => {
  console.error('Errore fatale:', err);
  process.exit(1);
});
