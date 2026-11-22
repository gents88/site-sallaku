import { describe, expect, it } from 'vitest';
import { buildZip, computeTargetSize, crc32, formatBytes, isHeicFile, isImageFile, outputName, savedPercent } from './image-tools.utils';

describe('computeTargetSize', () => {
  it('riduce il lato lungo mantenendo le proporzioni', () => {
    expect(computeTargetSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(computeTargetSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('non ingrandisce mai e senza limite lascia l\'originale', () => {
    expect(computeTargetSize(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(computeTargetSize(4000, 3000, null)).toEqual({ width: 4000, height: 3000 });
    expect(computeTargetSize(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
  });
  it('non produce mai lati nulli, nemmeno con immagini estreme', () => {
    expect(computeTargetSize(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe('isHeicFile', () => {
  const header = (brand: string) => Uint8Array.from([0, 0, 0, 24, ...'ftyp'.split('').map((c) => c.charCodeAt(0)), ...brand.split('').map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
  it('riconosce l\'intestazione anche senza estensione né tipo', () => {
    expect(isHeicFile(header('heic'), 'IMG_0001', '')).toBe(true);
    expect(isHeicFile(header('mif1'), 'foto', 'application/octet-stream')).toBe(true);
  });
  it('riconosce tipo ed estensione', () => {
    expect(isHeicFile(new Uint8Array(4), 'a.HEIC', '')).toBe(true);
    expect(isHeicFile(new Uint8Array(4), 'a.bin', 'image/heif')).toBe(true);
  });
  it('un JPEG o un MP4 non sono HEIC', () => {
    expect(isHeicFile(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), 'a.jpg', 'image/jpeg')).toBe(false);
    expect(isHeicFile(header('isom'), 'video.mp4', 'video/mp4')).toBe(false);
  });
});

describe('isImageFile', () => {
  it('accetta immagini per tipo o estensione e scarta il resto', () => {
    expect(isImageFile('a.png', '')).toBe(true);
    expect(isImageFile('x', 'image/webp')).toBe(true);
    expect(isImageFile('IMG.HEIC', '')).toBe(true);
    expect(isImageFile('doc.pdf', 'application/pdf')).toBe(false);
  });
});

describe('outputName', () => {
  it('cambia estensione e non crea doppioni nello stesso lotto', () => {
    const taken = new Set<string>();
    expect(outputName('foto.HEIC', 'jpg', taken)).toBe('foto.jpg');
    expect(outputName('foto.png', 'jpg', taken)).toBe('foto-2.jpg');
    expect(outputName('foto.webp', 'jpg', taken)).toBe('foto-3.jpg');
  });
  it('toglie i caratteri non ammessi e ha un ripiego per i nomi vuoti', () => {
    expect(outputName('a:b?c.png', 'jpg', new Set())).toBe('a_b_c.jpg');
    expect(outputName('.png', 'jpg', new Set())).toBe('immagine.jpg');
  });
});

describe('crc32', () => {
  it('coincide con i valori noti', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  it('produce un archivio con la struttura ZIP corretta', () => {
    const files = [
      { name: 'uno.jpg', data: Uint8Array.from([1, 2, 3, 4, 5]) },
      { name: 'è.png', data: new Uint8Array(0) },
    ];
    const zip = buildZip(files, new Date(2026, 10, 22, 10, 30, 0));
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50); // intestazione del primo file
    // fine dell'archivio: 22 byte con numero di voci e offset della directory centrale
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 8, true)).toBe(2);
    expect(v.getUint16(end + 10, true)).toBe(2);
    const cdOffset = v.getUint32(end + 16, true);
    expect(v.getUint32(cdOffset, true)).toBe(0x02014b50);
    // CRC e dimensioni nel primo file
    expect(v.getUint32(14, true)).toBe(crc32(files[0].data));
    expect(v.getUint32(18, true)).toBe(5);
    expect(v.getUint32(22, true)).toBe(5);
    // il nome e i dati seguono l'intestazione
    expect(new TextDecoder().decode(zip.subarray(30, 30 + 7))).toBe('uno.jpg');
    expect(Array.from(zip.subarray(37, 42))).toEqual([1, 2, 3, 4, 5]);
  });

  it('gestisce nomi UTF-8 con il flag giusto e un archivio vuoto', () => {
    const zip = buildZip([{ name: 'è.png', data: new Uint8Array(0) }]);
    expect(new DataView(zip.buffer).getUint16(6, true) & 0x0800).toBe(0x0800);
    const empty = buildZip([]);
    expect(empty.length).toBe(22);
  });
});

describe('formatBytes / savedPercent', () => {
  it('formatta e calcola', () => {
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.50 MB');
    expect(formatBytes(900)).toBe('900 B');
    expect(savedPercent(1000, 250)).toBe(75);
    expect(savedPercent(1000, 1200)).toBe(-20);
    expect(savedPercent(0, 5)).toBe(0);
  });
});
