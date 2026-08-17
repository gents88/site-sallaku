#!/usr/bin/env node
/**
 * Regenerates the responsive variants of the site's raster images.
 *
 * The profile photo was an 800x765 JPEG weighing 102KB, rendered into a
 * 220px-wide box — roughly 3.6x more pixels than any display needs and in a
 * format two generations old. At 440px (enough for 2x DPR) AVIF reaches the
 * same visible quality in ~8KB.
 *
 * Emits AVIF and WebP plus a resized JPEG, consumed by a <picture> element so
 * browsers pick the best format they support and older ones still get a
 * correctly sized fallback.
 *
 * Run after replacing a source image:
 *     node scripts/optimize-images.js
 *
 * sharp is resolved from backend/node_modules — it's already a backend
 * dependency, so the frontend doesn't need its own copy for a script that
 * runs by hand a couple of times a year.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const sharp = require(path.join(ROOT, 'backend/node_modules/sharp'));
const ASSETS = path.join(ROOT, 'frontend/src/assets');

/** source → { width, base }: rendered CSS width doubled for 2x displays. */
const IMAGES = [
  { src: 'profil.jpeg', base: 'profil', width: 440 },
];

async function build({ src, base, width }) {
  const input = path.join(ASSETS, src);
  if (!fs.existsSync(input)) {
    throw new Error(`Sorgente mancante: ${src}`);
  }

  const meta = await sharp(input).metadata();
  const before = fs.statSync(input).size;
  console.log(`${src} — ${meta.width}x${meta.height}, ${before} byte`);

  const outputs = [
    [`${base}.avif`, (p) => p.avif({ quality: 58 })],
    [`${base}.webp`, (p) => p.webp({ quality: 76 })],
    [`${base}-${width}.jpg`, (p) => p.jpeg({ quality: 80, mozjpeg: true })],
  ];

  for (const [name, encode] of outputs) {
    const dest = path.join(ASSETS, name);
    await encode(sharp(input).resize(width)).toFile(dest);
    const size = fs.statSync(dest).size;
    console.log(
      `  ${name.padEnd(20)} ${String(size).padStart(7)} byte ` +
        `(${(100 * (size - before) / before).toFixed(1)}%)`,
    );
  }
}

(async () => {
  for (const image of IMAGES) {
    await build(image);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
