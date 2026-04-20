/**
 * translate-posts-to-esfrde.mjs
 *
 * One-shot migration: translates title/content/excerpt to ES, FR, DE
 * for all posts that don't have these translations yet.
 *
 * Usage (from backend/ folder):
 *   MONGODB_URI=mongodb://... node translate-posts-to-esfrde.mjs
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
const COLLECTION  = 'posts';
const DELAY_MS    = 500;
const CHUNK_MAX   = 2000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function textToHtml(text = '') {
  return text.split(/\n\n+/).filter(Boolean).map(p => `<p>${p.trim()}</p>`).join('\n');
}

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
    const translated = json[0]?.map(part => part[0]).join('') ?? chunk;
    results.push(translated);
    if (chunks.length > 1) await sleep(DELAY_MS);
  }
  return results.join('\n\n');
}

async function translatePost(post, col, targetLang) {
  const lbl = `[${post.slug}] → ${targetLang.toUpperCase()}`;
  const keyTitle   = `title_${targetLang}`;
  const keyContent = `content_${targetLang}`;
  const keyExcerpt = `excerpt_${targetLang}`;

  // skip if already translated
  if (post[keyTitle]) {
    console.log(`   ⏭  ${lbl} già presente`);
    return;
  }

  console.log(`   🌐 ${lbl}`);

  // Source: use IT (original)
  const titleIt   = post.title || '';
  const contentIt = stripHtml(post.content || '');
  const excerptIt = post.excerpt || '';

  const title   = await translate(titleIt, 'it', targetLang);
  await sleep(DELAY_MS);
  const content = contentIt ? await translate(contentIt, 'it', targetLang) : '';
  await sleep(DELAY_MS);
  const excerpt = excerptIt ? await translate(excerptIt, 'it', targetLang) : '';
  if (excerptIt) await sleep(DELAY_MS);

  await col.updateOne({ _id: post._id }, {
    $set: {
      [keyTitle]:   title,
      [keyContent]: content ? textToHtml(content) : '',
      [keyExcerpt]: excerpt,
    },
  });
  console.log(`   ✅ ${lbl} salvato`);
}

async function main() {
  console.log(`\n📦 MongoDB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//<credentials>@')}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db().collection(COLLECTION);

  const posts = await col.find({}).toArray();
  console.log(`🔍 Post totali: ${posts.length}\n`);

  let ok = 0, errors = 0;

  for (const post of posts) {
    console.log(`\n📄 [${post.slug}]`);
    try {
      for (const lang of ['es', 'fr', 'de']) {
        await translatePost(post, col, lang);
      }
      ok++;
    } catch (err) {
      console.error(`   ❌ Errore: ${err.message}`);
      errors++;
      await sleep(3000);
    }
  }

  await client.close();
  console.log(`\n─────────────────────────────`);
  console.log(`✅ OK: ${ok} | ❌ Errori: ${errors}`);
  console.log(`─────────────────────────────\n`);
}

main().catch(err => { console.error('Errore fatale:', err); process.exit(1); });
