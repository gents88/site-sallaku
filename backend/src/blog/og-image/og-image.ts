/**
 * Immagine di anteprima (og:image) degli articoli senza copertina: la stessa
 * "cartolina" generata della lista del blog (colore e icona dal primo tag),
 * con in più titolo e firma, in SVG da convertire in PNG 1200×630.
 *
 * coverHue/coverIcon replicano quelle di
 * frontend/src/app/features/blog/blog-list/blog-list.component.ts:
 * se cambiano lì vanno cambiate anche qui, o anteprima e lista non coincidono.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const COVER_HUES = [228, 265, 192, 162, 22, 330, 44, 138];

export function coverHue(seed: string): number {
  let h = 0x811c9dc5; // FNV-1a
  for (const ch of seed.trim().toLowerCase()) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return COVER_HUES[h % COVER_HUES.length];
}

export function coverIcon(tag: string | undefined): string {
  const t = (tag ?? '').toLowerCase();
  const rules: [RegExp, string][] = [
    [/pdf|ocr|document|scanner|word|docx/, 'picture_as_pdf'],
    [/seo|google|indicizz|search/, 'travel_explore'],
    [/\b(ai|ia)\b|intelligenza|llm|prompt/, 'auto_awesome'],
    [/sicurezza|security|jwt|csp|segreti/, 'shield'],
    [/performance|core web vitals|ottimizz/, 'speed'],
    [/cesium|gis|3d|webgl/, 'public'],
    [/colloqui|carriera|freelance|clienti/, 'work'],
    [/accessibil|wcag/, 'accessibility_new'],
    [/angular|typescript|rxjs|signals|nestjs|javascript|css|react/, 'code'],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? 'article';
}

/** Path delle icone Material (24×24) usate da coverIcon, da google/material-design-icons. */
const ICON_PATHS: Record<string, string> = {
  picture_as_pdf: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
  travel_explore: 'M19.3,16.9c0.4-0.7,0.7-1.5,0.7-2.4c0-2.5-2-4.5-4.5-4.5S11,12,11,14.5s2,4.5,4.5,4.5c0.9,0,1.7-0.3,2.4-0.7l3.2,3.2 l1.4-1.4L19.3,16.9z M15.5,17c-1.4,0-2.5-1.1-2.5-2.5s1.1-2.5,2.5-2.5s2.5,1.1,2.5,2.5S16.9,17,15.5,17z M12,20v2 C6.48,22,2,17.52,2,12C2,6.48,6.48,2,12,2c4.84,0,8.87,3.44,9.8,8h-2.07c-0.64-2.46-2.4-4.47-4.73-5.41V5c0,1.1-0.9,2-2,2h-2v2 c0,0.55-0.45,1-1,1H8v2h2v3H9l-4.79-4.79C4.08,10.79,4,11.38,4,12C4,16.41,7.59,20,12,20z',
  auto_awesome: 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  speed: 'M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z',
  public: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  work: 'M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z',
  accessibility_new: 'M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z',
  code: 'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z',
  article: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z',
};

/** hsl → #rrggbb: il rasterizzatore SVG non è garantito sulle funzioni colore CSS. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [0, 8, 4].map(n => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('');
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Toglie le emoji (nei titoli capitano, es. "🔐 Sicurezza…"): il font del server non le ha. */
export function stripEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
}

/** Spezza il titolo a parole in righe da maxChars, al massimo maxLines (l'ultima con "…" se avanza testo). */
export function wrapTitle(title: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = title.split(' ').filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines) {
      line = '';
      lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s,.:;—-]+$/, '')}…`;
      break;
    }
  }
  if (line) lines.push(line);
  return lines.map(l => (l.length > maxChars + 8 ? `${l.slice(0, maxChars).trimEnd()}…` : l));
}

export interface OgCardInput {
  title: string;
  tag?: string;
  /** Usato per il colore se manca il tag, come nella lista. */
  slug: string;
}

export function buildOgSvg({ title, tag, slug }: OgCardInput): string {
  const hue = coverHue(tag ?? slug ?? '');
  const iconPath = ICON_PATHS[coverIcon(tag)];
  const lines = wrapTitle(stripEmoji(title), 27, 3); // 27 caratteri: DejaVu Sans Bold (server) è più largo di Helvetica
  const titleSize = 56;
  const lineHeight = 72;
  // Blocco verticale centrato: icona, #tag, titolo; firma in basso.
  const blockHeight = 120 + 36 + (tag ? 62 : 0) + lines.length * lineHeight;
  let y = Math.max(40, (OG_HEIGHT - 70 - blockHeight) / 2);
  const iconY = y;
  y += 120 + 36;
  const tagLabel = tag ? `#${stripEmoji(tag)}` : '';
  const tagWidth = Math.min(900, Math.round(tagLabel.length * 17.5 + 56));
  const tagY = y;
  if (tag) y += 62;
  const titleY = y + titleSize;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hslToHex(hue, 45, 20)}"/>
      <stop offset="1" stop-color="${hslToHex(hue + 30, 45, 12)}"/>
    </linearGradient>
    <radialGradient id="glow1" cx="0.18" cy="0.22" r="0.55">
      <stop offset="0" stop-color="${hslToHex(hue, 85, 62)}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="${hslToHex(hue, 85, 62)}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.85" cy="0.82" r="0.55">
      <stop offset="0" stop-color="${hslToHex(hue + 45, 80, 60)}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${hslToHex(hue + 45, 80, 60)}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity="0.05" stroke-width="2"/>
    </pattern>
    <radialGradient id="gridFade" cx="0.5" cy="0.5" r="0.6">
      <stop offset="0.3" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="gridMask"><rect width="100%" height="100%" fill="url(#gridFade)"/></mask>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#glow1)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>
  <rect width="100%" height="100%" fill="url(#grid)" mask="url(#gridMask)"/>
  <g transform="translate(${OG_WIDTH / 2 - 60} ${iconY}) scale(5)" fill="${hslToHex(hue, 90, 82)}">
    <path d="${iconPath}"/>
  </g>
  ${tag ? `<rect x="${(OG_WIDTH - tagWidth) / 2}" y="${tagY}" width="${tagWidth}" height="46" rx="23" fill="#ffffff" fill-opacity="0.12"/>
  <text x="${OG_WIDTH / 2}" y="${tagY + 32}" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeXml(tagLabel)}</text>` : ''}
  <text x="${OG_WIDTH / 2}" y="${titleY}" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#ffffff">${lines
    .map((l, i) => `<tspan x="${OG_WIDTH / 2}" dy="${i ? lineHeight : 0}">${escapeXml(l)}</tspan>`)
    .join('')}</text>
  <text x="${OG_WIDTH / 2}" y="${OG_HEIGHT - 42}" text-anchor="middle" font-family="DejaVu Sans, Helvetica, Arial, sans-serif" font-size="26" fill="#ffffff" fill-opacity="0.75">Gent Sallaku · gentsallaku.it</text>
</svg>`;
}
