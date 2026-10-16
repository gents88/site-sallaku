/**
 * Genera la card social di default (og:image) del sito: og-image.svg (sorgente)
 * e frontend/src/assets/og-image.png (1200×630).
 *
 * Il testo diventa path con Liberation Sans (stessi font del generatore degli
 * articoli del blog), quindi il risultato non dipende dai font installati.
 * Il testo è volutamente neutro rispetto alla lingua (nome, ruolo, stack,
 * dominio): una sola immagine vale per tutte e 7 le lingue del sito.
 *
 * Uso: node scripts/generate-og-image.js
 * Dopo aver cambiato l'immagine, incrementare ?v= in frontend/src/index.html e
 * seo.service.ts: Facebook/LinkedIn tengono l'immagine in cache per URL.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backendRequire = (name) => require(require.resolve(name, { paths: [path.join(root, 'backend')] }));
const sharp = backendRequire('sharp');
const opentype = backendRequire('opentype.js');

const FONTS = path.join(root, 'backend', 'src', 'blog', 'og-image', 'fonts');
const regular = opentype.loadSync(path.join(FONTS, 'LiberationSans-Regular.ttf'));
const bold = opentype.loadSync(path.join(FONTS, 'LiberationSans-Bold.ttf'));

const W = 1200;
const H = 630;
const MARGIN = 70;
const PHOTO = path.join(root, 'frontend', 'src', 'assets', 'profil.jpeg');
const OUT_PNG = path.join(root, 'frontend', 'src', 'assets', 'og-image.png');
const OUT_SVG = path.join(root, 'og-image.svg');

const font = (isBold) => (isBold ? bold : regular);
const width = (text, size, isBold) => font(isBold).getAdvanceWidth(text, size);
const text = (str, x, y, size, fill, isBold = false) =>
  `<path d="${font(isBold).getPath(str, x, y, size).toPathData(1)}" fill="${fill}"/>`;

/** Chip dello stack, a capo quando superano la colonna di sinistra. */
function chips(items, x0, y0, maxRight) {
  const size = 24;
  const padX = 18;
  const height = 46;
  const gap = 12;
  let x = x0;
  let y = y0;
  let out = '';
  for (const label of items) {
    const w = width(label, size, false) + padX * 2;
    if (x + w > maxRight) {
      x = x0;
      y += height + gap;
    }
    out +=
      `<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${height / 2}" fill="#6366f1" fill-opacity="0.16" stroke="#818cf8" stroke-opacity="0.45"/>` +
      text(label, x + padX, y + 31, size, '#c7d2fe');
    x += w + gap;
  }
  return out;
}

async function main() {
  const photoSize = 440;
  const photo = await sharp(PHOTO)
    .resize(photoSize, photoSize, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 88 })
    .toBuffer();

  const cx = 930;
  const cy = 315;
  const r = 190;
  const colRight = 710;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1220"/>
      <stop offset="1" stop-color="#111a33"/>
    </linearGradient>
    <radialGradient id="glow" cx="${cx}" cy="${cy}" r="430" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#818cf8"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#22d3ee"/>
    </linearGradient>
    <clipPath id="face"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 26}" fill="none" stroke="#818cf8" stroke-opacity="0.25" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${r + 8}" fill="none" stroke="url(#ring)" stroke-width="6"/>
  <image x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#face)" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/jpeg;base64,${photo.toString('base64')}"/>
  <rect x="${MARGIN}" y="118" width="64" height="6" rx="3" fill="url(#bar)"/>
  ${text('Gent Sallaku', MARGIN, 232, 96, '#ffffff', true)}
  ${text('Senior Front-End', MARGIN, 318, 54, '#e2e8f0')}
  ${text('& API Developer', MARGIN, 382, 54, '#e2e8f0')}
  ${chips(['Angular', 'TypeScript', '.NET', 'Django', '3D Viz'], MARGIN, 424, colRight)}
  ${text('gentsallaku.it', MARGIN, 566, 32, '#22d3ee', true)}
</svg>
`;

  fs.writeFileSync(OUT_SVG, svg);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT_PNG);
  console.log(`scritti ${path.relative(root, OUT_SVG)} e ${path.relative(root, OUT_PNG)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
