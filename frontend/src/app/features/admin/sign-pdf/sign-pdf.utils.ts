/**
 * Logica pura dello strumento "Firma PDF": modello dei campi posizionati sulla pagina,
 * conversione delle coordinate (anche per pagine ruotate) ed esportazione con pdf-lib.
 * Nessun accesso al DOM qui, così si testa senza browser.
 */

export type FieldKind = 'signature' | 'text' | 'date' | 'check' | 'cross';

export interface PlacedField {
  id: number;
  /** Indice di pagina, base 0 */
  page: number;
  kind: FieldKind;
  /**
   * Posizione e dimensione NORMALIZZATE (0..1) rispetto alla pagina così come la vede l'utente
   * (quindi già ruotata), con origine in alto a sinistra. Normalizzare le rende indipendenti
   * dallo zoom e dalla larghezza dello schermo.
   */
  x: number;
  y: number;
  w: number;
  h: number;
  /** PNG come data URL — firma, spunta, croce */
  image?: string;
  /** Testo — campi testo e data */
  text?: string;
  /** Corpo del testo come frazione della LARGHEZZA della pagina */
  fs?: number;
  /** Colore del testo, #rrggbb */
  color?: string;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Il box della pagina che pdf.js mostra (CropBox, altrimenti MediaBox), nello spazio grezzo del PDF. */
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPlacement {
  /** Angolo basso-sinistro dell'elemento, nello spazio grezzo del PDF (origine in basso a sinistra) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotazione antioraria in gradi da passare a pdf-lib, per far risultare l'elemento dritto nella vista */
  rotate: Rotation;
}

export function normalizeRotation(angle: number): Rotation {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return a as Rotation;
}

/** Dimensioni della pagina come la vede l'utente: con rotazione di 90°/270° larghezza e altezza si scambiano. */
export function viewedSize(box: PageBox, rotation: Rotation): { width: number; height: number } {
  return rotation === 90 || rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

/**
 * Punto (u, v) della pagina VISTA, in punti PDF con origine in alto a sinistra, → punto grezzo (X, Y)
 * con origine in basso a sinistra del box. Le quattro formule sono la rotazione inversa:
 * ruotando la pagina grezza in senso orario di `rotation` si ottiene la vista.
 */
export function viewToRaw(u: number, v: number, box: PageBox, rotation: Rotation): { x: number; y: number } {
  const { width: pw, height: ph } = box;
  let x: number;
  let y: number;
  switch (rotation) {
    case 90: x = v; y = u; break;
    case 180: x = pw - u; y = v; break;
    case 270: x = pw - v; y = ph - u; break;
    default: x = u; y = ph - v;
  }
  return { x: box.x + x, y: box.y + y };
}

/**
 * Dove e come disegnare un elemento rettangolare (immagine) perché compaia in `field.x/y/w/h`
 * della pagina vista. pdf-lib ruota attorno all'angolo basso-sinistro dell'elemento: quello è
 * l'angolo che si converte, e `rotate` = rotazione della pagina, così l'elemento resta dritto.
 */
export function imagePlacement(field: Pick<PlacedField, 'x' | 'y' | 'w' | 'h'>, box: PageBox, rotation: Rotation): PdfPlacement {
  const view = viewedSize(box, rotation);
  const width = field.w * view.width;
  const height = field.h * view.height;
  const u = field.x * view.width;
  const v = (field.y + field.h) * view.height; // angolo basso-sinistro nella vista
  const { x, y } = viewToRaw(u, v, box, rotation);
  return { x, y, width, height, rotate: rotation };
}

/** Rapporto tra l'altezza della linea di base e il corpo del testo (Helvetica: ascent ≈ 0,72, con un po' d'aria sopra). */
const BASELINE_RATIO = 0.82;

/** Punto di partenza (linea di base, a sinistra) di un testo il cui riquadro in alto a sinistra è field.x/y. */
export function textPlacement(field: Pick<PlacedField, 'x' | 'y' | 'fs'>, box: PageBox, rotation: Rotation): { x: number; y: number; size: number; rotate: Rotation } {
  const view = viewedSize(box, rotation);
  const size = (field.fs ?? 0.022) * view.width;
  const u = field.x * view.width;
  const v = field.y * view.height + size * BASELINE_RATIO;
  const { x, y } = viewToRaw(u, v, box, rotation);
  return { x, y, size, rotate: rotation };
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Tiene il campo dentro la pagina (almeno una parte resta sempre afferrabile). */
export function clampField<T extends Pick<PlacedField, 'x' | 'y' | 'w' | 'h'>>(f: T): T {
  const w = Math.min(f.w, 1);
  const h = Math.min(f.h, 1);
  return { ...f, w, h, x: Math.min(Math.max(f.x, 0), 1 - w), y: Math.min(Math.max(f.y, 0), 1 - h) };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Rende un testo come immagine quando il font standard del PDF non può codificarlo (es. cirillico, cinese). */
export type TextImageRenderer = (text: string, sizePt: number, color: string) => Promise<{ png: Uint8Array; width: number; height: number } | null>;

export interface ExportOptions {
  renderTextImage?: TextImageRenderer;
}

/**
 * Applica i campi al PDF e restituisce i nuovi byte. Il documento originale non viene modificato:
 * pdf-lib lavora su una copia in memoria.
 */
export async function exportSignedPdf(source: Uint8Array, fields: readonly PlacedField[], options: ExportOptions = {}): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const pdf = await PDFDocument.load(source);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (const field of fields) {
    const page = pages[field.page];
    if (!page) continue;
    const cb = page.getCropBox();
    const box: PageBox = { x: cb.x, y: cb.y, width: cb.width, height: cb.height };
    const rotation = normalizeRotation(page.getRotation().angle);

    if ((field.kind === 'signature' || field.kind === 'check' || field.kind === 'cross') && field.image) {
      let img = imageCache.get(field.image);
      if (!img) {
        img = await pdf.embedPng(dataUrlToBytes(field.image));
        imageCache.set(field.image, img);
      }
      const p = imagePlacement(field, box, rotation);
      page.drawImage(img, { x: p.x, y: p.y, width: p.width, height: p.height, rotate: degrees(p.rotate) });
      continue;
    }

    if ((field.kind === 'text' || field.kind === 'date') && field.text?.trim()) {
      const text = field.text;
      const color = hexToRgb01(field.color ?? '#000000');
      const p = textPlacement(field, box, rotation);
      let encodable = true;
      try {
        font.widthOfTextAtSize(text, p.size);
      } catch {
        encodable = false;
      }
      if (encodable) {
        page.drawText(text, { x: p.x, y: p.y, size: p.size, font, color: rgb(...color), rotate: degrees(p.rotate) });
      } else if (options.renderTextImage) {
        const rendered = await options.renderTextImage(text, p.size, field.color ?? '#000000');
        if (rendered) {
          const img = await pdf.embedPng(rendered.png);
          const view = viewedSize(box, rotation);
          const placement = imagePlacement(
            { x: field.x, y: field.y, w: rendered.width / view.width, h: rendered.height / view.height },
            box,
            rotation,
          );
          page.drawImage(img, { x: placement.x, y: placement.y, width: placement.width, height: placement.height, rotate: degrees(placement.rotate) });
        }
      }
    }
  }

  return pdf.save();
}

/** Data corrente nel formato della lingua dell'interfaccia, per il campo "Data". */
export function formatToday(locale: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Rende trasparenti i pixel quasi bianchi di una foto di firma: su un foglio la firma ha
 * lo sfondo bianco, che coprirebbe il testo del documento. Il passaggio è graduale (non un
 * taglio netto) per non lasciare un alone attorno al tratto.
 */
export function whiteToTransparent(data: Uint8ClampedArray, threshold = 235, softness = 30): void {
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (luma >= threshold) {
      data[i + 3] = 0;
    } else if (luma >= threshold - softness) {
      const keep = (threshold - luma) / softness;
      data[i + 3] = Math.round(data[i + 3] * keep);
    }
  }
}
