/**
 * Genera la card social di default (og:image) del sito: og-image.svg (sorgente)
 * e frontend/src/assets/og-image.png (1200×630).
 *
 * In alto a sinistra il marchio GS, con le stesse forme di frontend/src/favicon.svg:
 * se cambia il logo, aggiornare anche gsMark() qui sotto.
 *
 * Il testo diventa path con Liberation Sans (stessi font del generatore degli
 * articoli del blog), quindi il risultato non dipende dai font installati.
 * Il testo è volutamente neutro rispetto alla lingua (nome, ruolo, stack,
 * dominio): una sola immagine vale per tutte e 7 le lingue del sito.
 *
 * La foto viene ritagliata dallo sfondo bianco (flood fill dai bordi alto e
 * laterali, poi bordo sfumato): funziona perché lo sfondo di profil.jpeg è
 * bianco uniforme e la camicia, bianca anche lei, tocca solo il bordo in basso.
 * Con un'altra foto controllare il risultato a vista.
 *
 * Uso: node scripts/generate-og-image.js
 * Dopo aver cambiato l'immagine, incrementare ?v= in frontend/src/index.html e
 * seo.service.ts: Facebook/LinkedIn tengono l'immagine in cache per URL.
 * Il PNG resta sotto ~300 KB perché WhatsApp scarta le anteprime più pesanti.
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
const PHOTO = path.join(root, 'frontend', 'src', 'assets', 'profil.jpeg');
const OUT_PNG = path.join(root, 'frontend', 'src', 'assets', 'og-image.png');
const OUT_SVG = path.join(root, 'og-image.svg');

// Pannello di vetro a sinistra e contenuto al suo interno.
const PANEL = { x: 40, y: 56, w: 660, h: 518 };
const PAD = 40;
const LEFT = PANEL.x + PAD;
const INNER_RIGHT = PANEL.x + PANEL.w - PAD;

const font = (isBold) => (isBold ? bold : regular);
const width = (str, size, isBold) => font(isBold).getAdvanceWidth(str, size);
const text = (str, x, y, size, fill, isBold = false) =>
  `<path d="${font(isBold).getPath(str, x, y, size).toPathData(1)}" fill="${fill}"/>`;

/** Badge di disponibilità con pallino verde. */
function badge(label, x, y) {
  const size = 21;
  const h = 40;
  const w = 20 + 22 + width(label, size, false) + 20;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#34d399" fill-opacity="0.12" stroke="#34d399" stroke-opacity="0.45"/>` +
    `<circle cx="${x + 24}" cy="${y + h / 2}" r="9" fill="#34d399" fill-opacity="0.25"/>` +
    `<circle cx="${x + 24}" cy="${y + h / 2}" r="5" fill="#34d399"/>` +
    text(label, x + 42, y + 27, size, '#a7f3d0')
  );
}


/** Marchio GS (stesse forme di frontend/src/favicon.svg) in una tessera di lato size. */
function gsMark(x, y, size) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 940 940">
    <defs>
      <linearGradient id="gsbg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#01157a"/><stop offset=".55" stop-color="#02358f"/><stop offset="1" stop-color="#0a8ba6"/></linearGradient>
      <radialGradient id="gsgl" cx=".84" cy=".6" r=".28"><stop offset="0" stop-color="#3ff5e6" stop-opacity=".75"/><stop offset="1" stop-color="#3ff5e6" stop-opacity="0"/></radialGradient>
      <linearGradient id="gsmk" gradientUnits="userSpaceOnUse" x1="200" y1="800" x2="780" y2="190"><stop offset="0" stop-color="#2d6fe0"/><stop offset=".45" stop-color="#2fa8e8"/><stop offset="1" stop-color="#3dffc6"/></linearGradient>
    </defs>
    <rect width="940" height="940" rx="190" fill="url(#gsbg)"/><rect width="940" height="940" rx="190" fill="url(#gsgl)"/>
    <g transform="translate(-5 -33)">
      <path fill="url(#gsmk)" d="M500 187 C310 183 172 262 172 470 C172 645 240 748 385 808 L580 615 L410 435 L365 435 L365 522 L388 540 L470 610 L370 715 C310 690 265 600 265 420 C265 330 340 262 440 262 Z"/>
      <path fill="none" stroke="url(#gsmk)" stroke-width="84" stroke-linejoin="miter" d="M740 385 L740 228 L590 228 C520 228 492 280 492 335 C492 420 560 468 645 505 C735 543 745 585 745 650 C745 745 695 780 600 779"/>
      <path fill="url(#gsmk)" d="M612 737.5 L505 737.5 L430 820.5 L612 820.5 Z"/>
    </g>
  </svg>`;
}

/** Chip dello stack, a capo quando superano la colonna. */
function chips(items, x0, y0, maxRight) {
  const size = 22;
  const padX = 16;
  const height = 44;
  const gap = 10;
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
      `<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${height / 2}" fill="#6366f1" fill-opacity="0.18" stroke="#818cf8" stroke-opacity="0.5"/>` +
      text(label, x + padX, y + 30, size, '#c7d2fe');
    x += w + gap;
  }
  return out;
}

/** Globo wireframe: meridiani e paralleli, richiama il lavoro su Cesium/3D. */
function globe(cx, cy, r) {
  let out = `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  for (const k of [0.32, 0.64, 0.9]) out += `<ellipse cx="${cx}" cy="${cy}" rx="${r * k}" ry="${r}"/>`;
  for (const k of [0.3, 0.6, 0.85]) {
    const dy = r * k;
    const rx = Math.sqrt(r * r - dy * dy);
    out += `<ellipse cx="${cx}" cy="${cy - dy}" rx="${rx}" ry="${rx * 0.22}"/>`;
    out += `<ellipse cx="${cx}" cy="${cy + dy}" rx="${rx}" ry="${rx * 0.22}"/>`;
  }
  out += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.22}"/>`;
  return out;
}

/** Mini card "dashboard" fluttuante: barre + linea, a vetro come il pannello. */
function dashCard(x, y) {
  const bars = [34, 52, 40, 70, 58, 86, 74];
  let out = `<g transform="translate(${x} ${y}) rotate(6)">`;
  out += `<rect width="190" height="124" rx="16" fill="#0f172a" fill-opacity="0.78" stroke="#818cf8" stroke-opacity="0.5"/>`;
  out += `<circle cx="18" cy="18" r="4" fill="#f87171"/><circle cx="32" cy="18" r="4" fill="#fbbf24"/><circle cx="46" cy="18" r="4" fill="#34d399"/>`;
  bars.forEach((b, i) => {
    out += `<rect x="${16 + i * 24}" y="${108 - b}" width="14" height="${b}" rx="4" fill="url(#bar)" fill-opacity="${0.45 + i * 0.07}"/>`;
  });
  out += `<polyline points="${bars.map((b, i) => `${23 + i * 24},${100 - b * 0.95}`).join(' ')}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  out += `</g>`;
  return out;
}

/**
 * Ritaglia la persona dallo sfondo bianco: flood fill dai bordi sui pixel quasi
 * bianchi, sfondo ingrandito di 1 px per eliminare l'alone, alpha sfumata.
 */
async function cutout(file, height) {
  const { data, info } = await sharp(file).resize({ height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return Math.min(r, g, b) >= 205 && Math.max(r, g, b) - Math.min(r, g, b) <= 30;
  };
  const bg = new Uint8Array(w * h);
  const stack = [];
  const seed = (x, y) => {
    const i = y * w + x;
    if (!bg[i] && isBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  // Niente semi dal bordo in basso: lì la foto è tagliata sul busto e la camicia
  // bianca tocca il bordo, quindi verrebbe tolta come sfondo (e diventerebbe blu).
  // Lo sfondo vero raggiunge comunque il basso passando dai lati.
  for (let x = 0; x < w; x++) seed(x, 0);
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < w - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < h - 1) seed(x, y + 1);
  }
  // Allarga lo sfondo di 1 px: toglie la frangia bianca attorno a capelli e giacca.
  const grown = bg.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) continue;
      if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) grown[i] = 1;
    }
  }
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = grown[i] ? 0 : 255;
  // sharp espande la maschera a 3 canali dopo il blur: ne basta uno.
  const blurred = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(1.2).raw().toBuffer({ resolveWithObject: true });
  const stride = blurred.info.channels;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 4];
    rgba[i * 4 + 1] = data[i * 4 + 1];
    rgba[i * 4 + 2] = data[i * 4 + 2];
    rgba[i * 4 + 3] = blurred.data[i * stride];
  }
  const png = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, w, h };
}

async function main() {
  const figH = 520;
  const fig = await cutout(PHOTO, figH);
  const figX = W - fig.w;
  const figY = H - fig.h;
  const gx = 930;
  const gy = 300;

  const name = 'Gent Sallaku';
  const statLabel = '8+ years in enterprise web';
  const domain = 'gentsallaku.it';
  const domainW = width(domain, 30, true);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080d1a"/>
      <stop offset="1" stop-color="#121b38"/>
    </linearGradient>
    <radialGradient id="glow" cx="${gx}" cy="${gy}" r="440" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.6"/>
      <stop offset="0.55" stop-color="#4f46e5" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="${gx + 120}" cy="${gy - 40}" r="260" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow3" cx="1080" cy="600" r="380" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0ea5e9" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#0ea5e9" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2d6fe0"/>
      <stop offset="1" stop-color="#3dffc6"/>
    </linearGradient>
    <linearGradient id="nameGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.6" stop-color="#e0e7ff"/>
      <stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.03"/>
    </linearGradient>
    <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.6" fill="#a5b4fc"/>
    </pattern>
    <radialGradient id="fade" cx="520" cy="300" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="dotMask"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" mask="url(#dotMask)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>
  <rect width="${W}" height="${H}" fill="url(#glow3)"/>
  <g fill="none" stroke="#818cf8" stroke-opacity="0.28" stroke-width="1.5">${globe(gx, gy, 250)}</g>
  <circle cx="${gx}" cy="${gy}" r="285" fill="none" stroke="url(#accent)" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="3 9" stroke-linecap="round"/>
  ${dashCard(1010, 70)}
  <rect x="${PANEL.x}" y="${PANEL.y}" width="${PANEL.w}" height="${PANEL.h}" rx="32" fill="url(#panel)" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5"/>
  ${gsMark(LEFT, PANEL.y + 28, 58)}
  ${badge('Available for new projects', LEFT + 78, PANEL.y + 37)}
  ${`<path d="${bold.getPath(name, LEFT, 244, 88).toPathData(1)}" fill="url(#nameGrad)"/>`}
  <rect x="${LEFT}" y="266" width="64" height="5" rx="2.5" fill="url(#accent)"/>
  ${text('Senior Front-End', LEFT, 332, 50, '#e2e8f0')}
  ${text('& API Developer', LEFT, 390, 50, '#e2e8f0')}
  ${chips(['Angular', 'TypeScript', '.NET', 'Django', '3D Viz'], LEFT, 420, INNER_RIGHT)}
  <line x1="${LEFT}" y1="506" x2="${INNER_RIGHT}" y2="506" stroke="#ffffff" stroke-opacity="0.12"/>
  ${text(domain, LEFT, 548, 30, '#3ddbe0', true)}
  <circle cx="${LEFT + domainW + 22}" cy="538" r="3" fill="#64748b"/>
  ${text(statLabel, LEFT + domainW + 40, 547, 22, '#94a3b8')}
  <image x="${figX}" y="${figY}" width="${fig.w}" height="${fig.h}" xlink:href="data:image/png;base64,${fig.png.toString('base64')}"/>
</svg>
`;

  fs.writeFileSync(OUT_SVG, svg);
  await sharp(Buffer.from(svg)).png({ palette: true, quality: 92, effort: 10, dither: 1 }).toFile(OUT_PNG);
  const kb = Math.round(fs.statSync(OUT_PNG).size / 1024);
  console.log(`scritti ${path.relative(root, OUT_SVG)} e ${path.relative(root, OUT_PNG)} (${kb} KB)`);
  if (kb > 300) console.warn('Attenzione: il PNG supera 300 KB, WhatsApp potrebbe non mostrare l\'anteprima.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
