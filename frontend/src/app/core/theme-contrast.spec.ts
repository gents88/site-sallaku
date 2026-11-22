import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardia sui token di colore (src/styles.scss): se qualcuno ritocca un valore e il
 * contrasto scende sotto WCAG AA, il test fallisce — prima che lo veda un utente.
 * Misura sui token, non sui pixel: i controlli sulla pagina renderizzata li fa
 * axe-core nei test e2e (e2e/a11y.spec.ts).
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles.scss'), 'utf8');

const lightStart = css.indexOf("[data-theme='light'] {");
const lightEnd = css.indexOf('\n}\n', lightStart);
const darkStart = css.indexOf(':root {');
const darkEnd = css.indexOf('\n}\n', darkStart);
const DARK = css.slice(darkStart, darkEnd);
const LIGHT = css.slice(lightStart, lightEnd);

function token(block: string, name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  if (!m) throw new Error(`token ${name} non trovato`);
  return m[1].trim();
}

type RGB = [number, number, number];
function parseColor(value: string, over: RGB = [255, 255, 255]): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as RGB;
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((x) => x.trim());
    const alpha = Number(a);
    return [Number(r), Number(g), Number(b)].map((c, i) => Math.round(c * alpha + over[i] * (1 - alpha))) as RGB;
  }
  throw new Error(`colore non gestito: ${value}`);
}
function luminance([r, g, b]: RGB): number {
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Sfondi tipici su cui il testo colorato compare: pagina, superfici e un chip tinto di viola.
const LIGHT_BGS: Record<string, RGB> = { bianco: [255, 255, 255], pagina: [248, 250, 255], chip: [228, 229, 255] };
const DARK_BGS: Record<string, RGB> = { pagina: [10, 14, 26], superficie: [20, 26, 46] };

const SEMANTIC = ['violet', 'violet-soft', 'sky', 'sky-soft', 'green', 'green-soft', 'amber', 'amber-soft', 'red', 'red-soft', 'pink', 'orange'];

describe('contrasto dei token di colore (WCAG AA)', () => {
  for (const [label, block, bgs] of [['chiaro', LIGHT, LIGHT_BGS], ['scuro', DARK, DARK_BGS]] as const) {
    describe(`tema ${label}`, () => {
      for (const name of SEMANTIC) {
        it(`--c-${name} ≥ 4,5:1 sui fondi del tema`, () => {
          const fg = parseColor(token(block, `--c-${name}`));
          for (const [bgName, bg] of Object.entries(bgs)) {
            expect(contrast(fg, bg), `--c-${name} su ${bgName}`).toBeGreaterThanOrEqual(4.5);
          }
        });
      }

      for (const name of ['--link', '--accent-text']) {
        it(`${name} ≥ 4,5:1`, () => {
          const fg = parseColor(token(block, name));
          for (const [bgName, bg] of Object.entries(bgs)) {
            expect(contrast(fg, bg), `${name} su ${bgName}`).toBeGreaterThanOrEqual(4.5);
          }
        });
      }

      it('--border-strong ≥ 3:1 sulla pagina (bordi dei controlli, WCAG 1.4.11)', () => {
        const page = bgs['pagina'];
        const border = parseColor(token(block, '--border-strong'), page);
        expect(contrast(border, page)).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('--accent e --gradient-button: il testo bianco resta ≥ 4,5:1 su ogni tinta', () => {
    const white: RGB = [255, 255, 255];
    expect(contrast(white, parseColor(token(DARK, '--accent')))).toBeGreaterThanOrEqual(4.5);
    const gradient = token(DARK, '--gradient-button');
    const stops = gradient.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(2);
    for (const stop of stops) expect(contrast(white, parseColor(stop)), stop).toBeGreaterThanOrEqual(4.5);
  });

  it('i testi base restano ≥ 4,5:1 in entrambi i temi', () => {
    for (const [block, bgs] of [[LIGHT, LIGHT_BGS], [DARK, DARK_BGS]] as const) {
      for (const name of ['--text-primary', '--text-secondary', '--text-muted']) {
        const fg = parseColor(token(block, name));
        for (const [bgName, bg] of Object.entries(bgs)) {
          expect(contrast(fg, bg), `${name} su ${bgName}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
