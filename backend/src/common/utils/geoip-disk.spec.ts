// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoipLite = require('geoip-lite');
import * as fs from 'fs';
import * as path from 'path';
import { geoLookup } from './geoip-disk';

/**
 * geoLookup deve dare esattamente gli stessi paese/regione/città di geoip-lite
 * (che qui, solo nel test, viene caricato in RAM come riferimento).
 */
describe('geoLookup (lettura da disco dei dati geoip-lite)', () => {
  // PRNG deterministico: stessi IP a ogni esecuzione, fallimenti riproducibili
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const randomIp4 = () => Array.from({ length: 4 }, () => Math.floor(rand() * 256)).join('.');
  const randomIp6 = () => {
    // prefissi globali reali (2000::/3) così buona parte degli indirizzi ha un match
    const first = (0x2000 + Math.floor(rand() * 0x2000)).toString(16);
    return [first, ...Array.from({ length: 7 }, () => Math.floor(rand() * 0x10000).toString(16))].join(':');
  };

  const expected = (ip: string) => {
    const r = geoipLite.lookup(ip);
    return r ? { country: r.country, region: r.region, city: r.city } : null;
  };

  it('coincide con geoip-lite su 3000 indirizzi IPv4 casuali', () => {
    const mismatches: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const ip = randomIp4();
      if (JSON.stringify(geoLookup(ip)) !== JSON.stringify(expected(ip))) mismatches.push(ip);
    }
    expect(mismatches).toEqual([]);
  });

  it('coincide con geoip-lite su 1000 indirizzi IPv6 casuali', () => {
    const mismatches: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const ip = randomIp6();
      if (JSON.stringify(geoLookup(ip)) !== JSON.stringify(expected(ip))) mismatches.push(ip);
    }
    expect(mismatches).toEqual([]);
  });

  // Gli indirizzi casuali cadono quasi sempre fuori dai range: qui si prendono
  // range veri dai file dati e si provano inizio, fine e vicini dei confini.
  const dataDir = path.join(path.dirname(require.resolve('geoip-lite/package.json')), 'data');

  it('coincide con geoip-lite ai confini di 500 range IPv4 reali', () => {
    const file = fs.readFileSync(path.join(dataDir, 'geoip-city.dat'));
    const lines = file.length / 24;
    const ntoa = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
    const mismatches: string[] = [];
    for (let i = 0; i < 500; i++) {
      const line = Math.floor(rand() * lines);
      const floor = file.readUInt32BE(line * 24);
      const ceil = file.readUInt32BE(line * 24 + 4);
      for (const n of [floor, ceil, floor - 1, ceil + 1]) {
        if (n < 0 || n > 0xffffffff) continue;
        const ip = ntoa(n >>> 0);
        if (JSON.stringify(geoLookup(ip)) !== JSON.stringify(expected(ip))) mismatches.push(ip);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('coincide con geoip-lite su 500 range IPv6 reali (inizio, fine, metà)', () => {
    const file = fs.readFileSync(path.join(dataDir, 'geoip-city6.dat'));
    const lines = file.length / 48;
    const toIp6 = (hi: number, lo: number) =>
      [hi >>> 16, hi & 0xffff, lo >>> 16, lo & 0xffff].map(w => w.toString(16)).join(':') + '::';
    let matched = 0;
    const mismatches: string[] = [];
    for (let i = 0; i < 500; i++) {
      const line = Math.floor(rand() * lines);
      const fh = file.readUInt32BE(line * 48), fl = file.readUInt32BE(line * 48 + 4);
      const ch = file.readUInt32BE(line * 48 + 16), cl = file.readUInt32BE(line * 48 + 20);
      const mid = fh === ch ? toIp6(fh, Math.floor((fl + cl) / 2)) : toIp6(fh, fl);
      for (const ip of [toIp6(fh, fl), toIp6(ch, cl), mid]) {
        const geo = geoLookup(ip);
        if (geo?.country) matched++;
        if (JSON.stringify(geo) !== JSON.stringify(expected(ip))) mismatches.push(ip);
      }
    }
    expect(mismatches).toEqual([]);
    // il test ha senso solo se la maggior parte degli indirizzi trova davvero un range
    expect(matched).toBeGreaterThan(1000);
  });

  it('risolve indirizzi noti e i casi limite come geoip-lite', () => {
    for (const ip of [
      '151.38.39.1', '8.8.8.8', '1.1.1.1', '93.62.236.1',
      '::ffff:151.38.39.1', '2001:4860:4860::8888', '2a00:1450:4001::1',
      '0.0.0.0', '255.255.255.255', '10.1.2.3', '192.168.1.1', '172.16.5.4', '::1',
    ]) {
      expect({ ip, geo: geoLookup(ip) }).toEqual({ ip, geo: expected(ip) });
    }
    expect(geoLookup('151.38.39.1')?.country).toBe('IT');
  });

  it('restituisce null per input non validi', () => {
    expect(geoLookup('')).toBeNull();
    expect(geoLookup('non-un-ip')).toBeNull();
    expect(geoLookup('999.1.1.1')).toBeNull();
  });
});
