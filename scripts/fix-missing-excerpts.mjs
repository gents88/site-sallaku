/**
 * fix-missing-excerpts.mjs
 *
 * One-shot migration: translates excerpt to EN and SQ for posts that have
 * content_en / content_sq but missing excerpt_en / excerpt_sq.
 *
 * Usage (from backend/ folder):
 *   MONGODB_URI=mongodb://... node ../scripts/fix-missing-excerpts.mjs
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/portfolio';
const COLLECTION  = 'posts';
const DELAY_MS    = 400;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

function autoExcerpt(text, max = 200) {
  const t = stripHtml(text).trim();
  if (t.length <= max) return t;
  const cut = t.lastIndexOf(' ', max);
  return t.slice(0, cut > 0 ? cut : max) + '…';
}

async function translate(text, from, to) {
  const safe = (text || '').trim();
  if (!safe) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(safe)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from Google Translate`);
  const json = await res.json();
  return json[0]?.map(part => part[0]).join('') ?? safe;
}

async function main() {
  console.log(`\n📦 MongoDB: ${MONGODB_URI.replace(/\/\/[^@]+@/, '//<credentials>@')}`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db().collection(COLLECTION);

  const posts = await col.find({
    $or: [
      { excerpt_en: { $in: [null, '', undefined] } },
      { excerpt_sq: { $in: [null, '', undefined] } },
    ],
  }).toArray();

  console.log(`🔍 Post con excerpt mancanti: ${posts.length}\n`);
  if (!posts.length) { await client.close(); return; }

  let ok = 0, errors = 0;

  for (const post of posts) {
    const lbl = post.slug || post._id;
    console.log(`🌐 [${lbl}]`);
    try {
      const itExcerpt = post.excerpt || autoExcerpt(post.content || '', 220);
      const $set = {};
      if (!post.excerpt_en) { $set.excerpt_en = await translate(itExcerpt, 'it', 'en'); await sleep(DELAY_MS); }
      if (!post.excerpt_sq) { $set.excerpt_sq = await translate(itExcerpt, 'it', 'sq'); await sleep(DELAY_MS); }
      if (Object.keys($set).length) {
        await col.updateOne({ _id: post._id }, { $set });
        console.log(`   ✅ salvato: ${Object.keys($set).join(', ')}`);
      }
      ok++;
    } catch (err) {
      console.error(`   ❌ errore: ${err.message}`);
      errors++;
      await sleep(2000);
    }
  }

  await client.close();
  console.log(`\n✅ OK: ${ok} | ❌ Errori: ${errors}\n`);
}

main().catch(err => { console.error('Errore fatale:', err); process.exit(1); });
