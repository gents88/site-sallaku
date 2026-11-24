#!/usr/bin/env node
/**
 * IndexNow: avvisa Bing (e gli altri motori che lo adottano: Yandex, Seznam, Naver…)
 * delle pagine nuove o cambiate, invece di aspettare che le riscansionino.
 * Bing Webmaster Tools segnala "IndexNow non adottato" finché il sito non invia nulla.
 *
 * La chiave è il nome del file <chiave>.txt in frontend/public (contiene la chiave stessa):
 * finisce alla radice del sito e prova a Bing che le richieste vengono da chi gestisce il dominio.
 * Non è un segreto: è pubblica per definizione.
 *
 * Uso:
 *   node scripts/indexnow.js <sitemap-attuale> [sitemap-precedente] [--all] [--dry-run]
 * Con la sitemap precedente invia solo gli URL nuovi o con <lastmod> cambiato;
 * senza (o con --all) invia tutti gli URL. Un errore di rete o di IndexNow non fa
 * fallire il rilascio: viene solo scritto nel log.
 */
const fs = require('fs');
const path = require('path');

const HOST = 'gentsallaku.it';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_URLS = 10000; // limite di IndexNow per richiesta

function findKey() {
  const dir = path.join(__dirname, '..', 'frontend', 'public');
  const file = fs.readdirSync(dir).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (!file) throw new Error('Nessun file chiave IndexNow (<32 caratteri esadecimali>.txt) in frontend/public');
  const key = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  if (`${key}.txt` !== file) throw new Error(`Il file ${file} deve contenere la chiave ${file.replace('.txt', '')}`);
  return key;
}

/** Mappa loc → lastmod di una sitemap. */
function readSitemap(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = new Map();
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(m[1])?.[1];
    const lastmod = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[1])?.[1] ?? '';
    if (loc) out.set(loc, lastmod);
  }
  return out;
}

/** URL da inviare: tutti, oppure solo quelli nuovi o con lastmod cambiato rispetto alla sitemap precedente. */
function changedUrls(current, previous) {
  const urls = [];
  for (const [loc, lastmod] of current) {
    if (!previous || previous.get(loc) !== lastmod) urls.push(loc);
  }
  // Solo il nostro dominio: IndexNow rifiuta l'intera richiesta se un URL è di un altro host.
  return urls.filter((u) => new URL(u).host === HOST).slice(0, MAX_URLS);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const [currentFile, previousFile] = args.filter((a) => !a.startsWith('--'));
  if (!currentFile) throw new Error('Uso: node scripts/indexnow.js <sitemap-attuale> [sitemap-precedente] [--all] [--dry-run]');

  const key = findKey();
  const current = readSitemap(currentFile);
  const previous = !flags.has('--all') && previousFile && fs.existsSync(previousFile) ? readSitemap(previousFile) : null;
  const urlList = changedUrls(current, previous);

  console.log(`IndexNow: ${urlList.length} URL da inviare su ${current.size} (${previous ? 'solo cambiati' : 'tutti'})`);
  if (!urlList.length) return;

  const body = { host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList };
  if (flags.has('--dry-run')) {
    console.log(JSON.stringify({ ...body, urlList: urlList.slice(0, 5).concat(urlList.length > 5 ? ['…'] : []) }, null, 2));
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200 = ricevuto, 202 = ricevuto, chiave in verifica. 403 = chiave non trovata sul sito, 422 = URL non validi, 429 = troppe richieste.
  const text = await res.text().catch(() => '');
  if (res.status === 200 || res.status === 202) {
    console.log(`IndexNow: inviati ${urlList.length} URL (HTTP ${res.status})`);
  } else {
    console.warn(`IndexNow: risposta HTTP ${res.status} ${text.slice(0, 300)}`);
    process.exitCode = flags.has('--strict') ? 1 : 0;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.warn(`IndexNow: non inviato — ${err.message}`);
  });
}

module.exports = { readSitemap, changedUrls, findKey };
