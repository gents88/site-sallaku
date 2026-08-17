#!/usr/bin/env node
/**
 * Pre-compresses the built assets with Brotli (and a stronger Gzip).
 *
 * The production host runs Apache under Plesk without mod_brotli: asking for
 * `Accept-Encoding: br` alone returns an *uncompressed* response, which is
 * how you can tell the module isn't loaded rather than just unused. Enabling
 * it needs server-level access we don't have from a FileZilla deploy.
 *
 * So instead of compressing per request, compress once at build time and let
 * a small mod_rewrite rule in .htaccess serve `<file>.br` when the client
 * advertises Brotli. This is strictly better than mod_brotli would have been:
 * quality 11 is far too slow to run per request, but it's free here because
 * it runs once on the build machine.
 *
 * Gzip copies are emitted alongside at maximum level for the same reason —
 * clients without Brotli get a better-compressed file than mod_deflate's
 * default level would produce on the fly.
 *
 * Run after the production build, before uploading:
 *     node scripts/precompress.js frontend/dist/portfolio-frontend/browser
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXTENSIONS = new Set([
  '.js', '.mjs', '.css', '.html', '.json', '.svg', '.xml', '.txt', '.webmanifest',
]);

/** Below this, compression headers cost more than the bytes they save. */
const MIN_BYTES = 1024;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node scripts/precompress.js <cartella-build>');
    process.exit(1);
  }

  const root = path.resolve(target);
  if (!fs.existsSync(root)) {
    console.error(`Cartella non trovata: ${root}`);
    process.exit(1);
  }

  let files = 0;
  let raw = 0;
  let br = 0;
  let gz = 0;

  for (const file of walk(root)) {
    if (file.endsWith('.br') || file.endsWith('.gz')) continue;
    if (!EXTENSIONS.has(path.extname(file))) continue;

    const source = fs.readFileSync(file);
    if (source.length < MIN_BYTES) continue;

    const brotli = zlib.brotliCompressSync(source, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    });
    const gzip = zlib.gzipSync(source, { level: 9 });

    fs.writeFileSync(`${file}.br`, brotli);
    fs.writeFileSync(`${file}.gz`, gzip);

    files += 1;
    raw += source.length;
    br += brotli.length;
    gz += gzip.length;
  }

  const pct = (a, b) => `${(100 * (a - b) / b).toFixed(1)}%`;
  console.log(`[precompress] ${files} file`);
  console.log(`  originale ${raw} byte`);
  console.log(`  gzip -9   ${gz} byte  (${pct(gz, raw)})`);
  console.log(`  brotli 11 ${br} byte  (${pct(br, raw)})`);
  console.log(`  brotli vs gzip: ${pct(br, gz)}`);
}

main();
