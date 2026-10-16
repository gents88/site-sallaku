import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

/**
 * IP → paese/regione/città leggendo i file dati di geoip-lite direttamente dal
 * disco, invece di `import 'geoip-lite'`, che al require carica ~107 MB di
 * buffer in RAM (il backend gira su un server da 1.8 GB senza swap).
 *
 * Stesso formato e stessa ricerca binaria di geoip-lite (lib/geoip.js): record a
 * dimensione fissa ordinati per range di IP. Ogni lookup fa ~25 letture da pochi
 * byte con fs.readSync, servite dalla page cache del kernel. I dati restano
 * quelli del pacchetto geoip-lite, aggiornati con le sue release.
 * geoip-disk.spec.ts verifica che i risultati coincidano con geoip-lite.
 */

export interface GeoLookupResult {
  country: string;
  region: string;
  city: string;
}

const CITY_RECORD_SIZE4 = 24;
const COUNTRY_RECORD_SIZE4 = 10;
const CITY_RECORD_SIZE6 = 48;
const COUNTRY_RECORD_SIZE6 = 34;
const LOCATION_RECORD_SIZE = 88;
const NO_LOCATION = -1 >>> 0;

type Ip6 = [number, number];

interface Table<T> {
  fd: number;
  recordSize: number;
  lastLine: number;
  firstIP: T;
  lastIP: T;
}

interface Tables {
  v4: Table<number>;
  v6: Table<Ip6>;
  /** null quando ci sono solo i file "country" (nessuna città/regione). */
  locationsFd: number | null;
}

let tables: Tables | null = null;

function dataDir(): string {
  // require.resolve trova il pacchetto senza eseguirlo (niente preload in RAM)
  return path.join(path.dirname(require.resolve('geoip-lite/package.json')), 'data');
}

function readBytes(fd: number, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, offset);
  return buf;
}

function openFirst(...files: string[]): { fd: number; file: string } {
  for (const file of files) {
    try {
      const fd = fs.openSync(file, 'r');
      if (fs.fstatSync(fd).size > 0) return { fd, file };
      fs.closeSync(fd);
    } catch {
      // prova il file successivo
    }
  }
  throw new Error(`geoip: nessun file dati leggibile tra ${files.join(', ')}`);
}

function openTables(): Tables {
  const dir = dataDir();
  const v4 = openFirst(path.join(dir, 'geoip-city.dat'), path.join(dir, 'geoip-country.dat'));
  const v6 = openFirst(path.join(dir, 'geoip-city6.dat'), path.join(dir, 'geoip-country6.dat'));
  const city = v4.file.endsWith('geoip-city.dat');

  let locationsFd: number | null = null;
  if (city) locationsFd = openFirst(path.join(dir, 'geoip-city-names.dat')).fd;

  const size4 = city ? CITY_RECORD_SIZE4 : COUNTRY_RECORD_SIZE4;
  const size6 = v6.file.endsWith('geoip-city6.dat') ? CITY_RECORD_SIZE6 : COUNTRY_RECORD_SIZE6;
  const lastLine4 = fs.fstatSync(v4.fd).size / size4 - 1;
  const lastLine6 = fs.fstatSync(v6.fd).size / size6 - 1;

  return {
    v4: {
      fd: v4.fd,
      recordSize: size4,
      lastLine: lastLine4,
      firstIP: readBytes(v4.fd, 0, 4).readUInt32BE(0),
      lastIP: readBytes(v4.fd, lastLine4 * size4 + 4, 4).readUInt32BE(0),
    },
    v6: {
      fd: v6.fd,
      recordSize: size6,
      lastLine: lastLine6,
      firstIP: readIp6(readBytes(v6.fd, 0, 8), 0),
      lastIP: readIp6(readBytes(v6.fd, lastLine6 * size6 + 16, 8), 0),
    },
    locationsFd,
  };
}

function readIp6(buf: Buffer, offset: number): Ip6 {
  return [buf.readUInt32BE(offset), buf.readUInt32BE(offset + 4)];
}

function cmp6(a: Ip6, b: Ip6): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/** Stringa terminata da NUL dentro un campo a lunghezza fissa (come bufstr di geoip-lite). */
function fixedString(buf: Buffer, start: number, end: number): string {
  const nul = buf.indexOf(0, start);
  return buf.toString('utf8', start, nul >= start && nul < end ? nul : end);
}

function aton4(ip: string): number {
  return ip.split('.').reduce((n, octet) => ((n << 8) | Number(octet)) >>> 0, 0);
}

/** Primi 64 bit dell'indirizzo IPv6 (gli unici usati dai dati di geoip-lite). */
function aton6(ip: string): Ip6 {
  const parts = ip.split(':');
  const gap = parts.indexOf('');
  const groups: string[] = gap === -1
    ? parts
    : [
        ...parts.slice(0, gap),
        ...Array(8 - parts.filter(p => p !== '').length).fill('0'),
        ...parts.slice(gap).filter(p => p !== ''),
      ];
  const words = groups.slice(0, 4).map(g => parseInt(g || '0', 16));
  return [((words[0] << 16) + words[1]) >>> 0, ((words[2] << 16) + words[3]) >>> 0];
}

const PRIVATE_RANGES4: Array<[number, number]> = [
  [aton4('10.0.0.0'), aton4('10.255.255.255')],
  [aton4('172.16.0.0'), aton4('172.31.255.255')],
  [aton4('192.168.0.0'), aton4('192.168.255.255')],
];

function location(t: Tables, locId: number): GeoLookupResult {
  if (t.locationsFd === null || locId >= NO_LOCATION) return { country: '', region: '', city: '' };
  const rec = readBytes(t.locationsFd, locId * LOCATION_RECORD_SIZE, LOCATION_RECORD_SIZE);
  return {
    country: fixedString(rec, 0, 2),
    region: fixedString(rec, 2, 5),
    city: fixedString(rec, 42, LOCATION_RECORD_SIZE),
  };
}

/**
 * Ricerca binaria identica a quella di geoip-lite (stesso ciclo fline/cline),
 * non una ricerca "da manuale": nei dati IPv6 decine di record consecutivi
 * hanno lo stesso prefisso a 64 bit (geoip-lite confronta solo quelli) e il
 * record restituito dipende da dove atterra la ricerca. Solo replicando il suo
 * ciclo si ottengono gli stessi risultati.
 */
function search<T>(
  table: Table<T>,
  ip: T,
  compare: (a: T, b: T) => number,
  bounds: (rec: Buffer) => [T, T],
): Buffer | null {
  let fline = 0;
  let cline = table.lastLine;
  for (;;) {
    const line = (fline + cline) >>> 1;
    const rec = readBytes(table.fd, line * table.recordSize, table.recordSize);
    const [floor, ceil] = bounds(rec);
    if (compare(floor, ip) <= 0 && compare(ceil, ip) >= 0) return rec;
    if (fline === cline) return null;
    if (fline === cline - 1) {
      if (line === fline) fline = cline;
      else cline = fline;
    } else if (compare(floor, ip) > 0) {
      cline = line;
    } else if (compare(ceil, ip) < 0) {
      fline = line;
    }
  }
}

const cmp4 = (a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0);

function lookup4(t: Tables, ip: number): GeoLookupResult | null {
  const { v4 } = t;
  if (ip > v4.lastIP || ip < v4.firstIP) return null;
  if (PRIVATE_RANGES4.some(([from, to]) => ip >= from && ip <= to)) return null;

  const rec = search(v4, ip, cmp4, r => [r.readUInt32BE(0), r.readUInt32BE(4)]);
  if (!rec) return null;
  if (v4.recordSize === COUNTRY_RECORD_SIZE4) return { country: rec.toString('utf8', 8, 10), region: '', city: '' };
  return location(t, rec.readUInt32BE(8));
}

function lookup6(t: Tables, ip: Ip6): GeoLookupResult | null {
  const { v6 } = t;
  if (cmp6(ip, v6.lastIP) > 0 || cmp6(ip, v6.firstIP) < 0) return null;

  const rec = search(v6, ip, cmp6, r => [readIp6(r, 0), readIp6(r, 16)]);
  if (!rec) return null;
  if (v6.recordSize === COUNTRY_RECORD_SIZE6) return { country: fixedString(rec, 32, 34), region: '', city: '' };
  return location(t, rec.readUInt32BE(32));
}

/** Equivalente di `geoip.lookup(ip)` di geoip-lite, limitato a paese/regione/città. */
export function geoLookup(ip: string): GeoLookupResult | null {
  if (!ip) return null;
  const version = net.isIP(ip);
  if (version === 0) return null;
  if (!tables) tables = openTables();

  if (version === 4) return lookup4(tables, aton4(ip));
  const mapped = /^(?:0:0:0:0:0:ffff:|::ffff:)(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return lookup4(tables, aton4(mapped[1]));
  return lookup6(tables, aton6(ip));
}
