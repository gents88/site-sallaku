/**
 * Logica pura dello strumento "Immagini": dimensioni di uscita, riconoscimento dei formati,
 * nomi dei file e creazione di un archivio ZIP. Niente DOM, così si testa senza browser.
 */

export type OutFormat = 'jpeg' | 'png' | 'webp';

export const FORMATS: Readonly<Record<OutFormat, { mime: string; ext: string; lossy: boolean }>> = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg', lossy: true },
  png: { mime: 'image/png', ext: 'png', lossy: false },
  webp: { mime: 'image/webp', ext: 'webp', lossy: true },
};

/** Lati lunghi proposti (px). `null` = dimensione originale. */
export const SIZE_PRESETS: readonly (number | null)[] = [null, 3840, 2560, 1920, 1600, 1280, 1024, 800];

export const MAX_FILES = 40;
export const MAX_FILE_BYTES = 60 * 1024 * 1024;
/** Area massima (px) di un'immagine decodificata: oltre, i canvas dei telefoni falliscono o restituiscono bianco. */
export const MAX_PIXELS = 64_000_000;

/**
 * Dimensioni di uscita: il lato lungo non supera `maxSide`, le proporzioni restano quelle
 * dell'originale e un'immagine più piccola non viene mai ingrandita.
 */
export function computeTargetSize(width: number, height: number, maxSide: number | null): { width: number; height: number } {
  if (!maxSide || maxSide <= 0) return { width, height };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const ratio = maxSide / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

/**
 * HEIC/HEIF: si guardano i primi byte (il "brand" dopo `ftyp`), non solo l'estensione — le foto
 * dell'iPhone condivise via app a volte perdono o cambiano il nome, ma l'intestazione resta.
 */
export function isHeicFile(head: Uint8Array, name: string, type: string): boolean {
  if (head.length >= 12 && String.fromCharCode(head[4], head[5], head[6], head[7]) === 'ftyp') {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]).toLowerCase();
    if (HEIC_BRANDS.includes(brand)) return true;
  }
  const t = type.toLowerCase();
  if (t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence') return true;
  return /\.(heic|heif)$/i.test(name);
}

/** File che lo strumento prova ad aprire (immagini raster). */
export function isImageFile(name: string, type: string): boolean {
  return type.toLowerCase().startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(name);
}

/** Nome del file di uscita: stesso nome, nuova estensione, senza doppioni nello stesso lotto (foto.jpg, foto-2.jpg…). */
export function outputName(original: string, ext: string, taken: Set<string>): string {
  const base = original.replace(/\.[^.\\/]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'immagine';
  let candidate = `${base}.${ext}`;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base}-${i}.${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

// ── ZIP (senza compressione) ────────────────────────────────────

let crcTable: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Archivio ZIP con i file "memorizzati" (metodo 0, nessuna compressione): le immagini JPEG/PNG/WebP
 * sono già compresse, comprimerle ancora non farebbe risparmiare nulla e richiederebbe una libreria.
 * Nomi in UTF-8 (flag 0x0800), nessuno ZIP64: basta per i limiti dello strumento.
 */
export function buildZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // versione necessaria
    lv.setUint16(6, 0x0800, true); // nomi UTF-8
    lv.setUint16(8, 0, true); // metodo: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, e.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + e.data.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of all) { out.set(p, pos); pos += p.length; }
  return out;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

/** Variazione di peso in percentuale: positiva = file più leggero, negativa = più pesante. */
export function savedPercent(before: number, after: number): number {
  return before ? Math.round(((before - after) / before) * 100) : 0;
}
