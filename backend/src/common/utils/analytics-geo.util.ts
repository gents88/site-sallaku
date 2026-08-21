import { Request } from 'express';
import * as geoip from 'geoip-lite';

/**
 * Pure helpers shared by the analytics tracking/query/export services
 * (split out of the former monolithic AnalyticsService) — IP/geo/UA
 * parsing and small formatting utilities with no DB or cache dependency.
 */

export function normalizeIp(ip: string): string {
  if (!ip) return '';

  let normalized = ip.trim();
  if (!normalized) return '';

  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.slice(7);
  }

  if (normalized.startsWith('[') && normalized.includes(']')) {
    normalized = normalized.slice(1, normalized.indexOf(']'));
  }

  const ipv4WithPortMatch = normalized.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  if (ipv4WithPortMatch) {
    normalized = ipv4WithPortMatch[1];
  }

  return normalized;
}

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (['::1', '127.0.0.1', 'localhost'].includes(ip)) return true;

  if (ip.includes(':')) {
    const lowerIp = ip.toLowerCase();
    return lowerIp.startsWith('fc') || lowerIp.startsWith('fd') || lowerIp.startsWith('fe80');
  }

  const octets = ip.split('.').map(part => Number(part));
  if (octets.length !== 4 || octets.some(Number.isNaN)) return false;

  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;

  return false;
}

export function extractRawIp(req?: Request): string {
  if (!req) return '';
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIps = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded ?? '')
    .split(',')
    .map(ip => normalizeIp(ip))
    .filter(Boolean);
  const socketIp = normalizeIp((req.socket?.remoteAddress) ?? (req as any).ip ?? req.ip ?? '');

  const publicForwardedIp = forwardedIps.find(ip => !isPrivateIp(ip));
  if (publicForwardedIp) return publicForwardedIp;
  if (forwardedIps.length > 0) return forwardedIps[0];
  if (socketIp) return socketIp;

  return '';
}

/**
 * Truncates the client IP before it is ever persisted (called with the raw
 * IP only; the result is what's stored). Matches the masking Google
 * Analytics/Matomo use for "IP anonymization":
 *  - IPv4 → zero the last octet (/24), e.g. 93.62.236.1 → 93.62.236.0
 *  - IPv6 → keep only the first 3 hextets (/48), e.g. 2001:db8:85a3::… → 2001:db8:85a3::
 *    A /64 (4 hextets) is commonly the prefix an ISP assigns to a single
 *    subscriber, so truncating only that far would not be an anonymization
 *    equivalent in strength to the IPv4 case — /48 is the accepted floor.
 * `resolveGeo()` uses the raw IP in-memory for the lookup and is called
 * separately; the raw value is never written to the database.
 */
export function anonymizeIp(ip: string): string {
  if (!ip) return '';
  const ipv4Match = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (ipv4Match) return ipv4Match[1] + '.0';
  if (ip.includes(':')) return ip.split(':').slice(0, 3).join(':') + '::';
  return ip;
}

export function resolveGeo(ip: string): { country: string; city: string; region: string } {
  let normalizedIp = normalizeIp(ip);

  // In development, use well-known public IPs so geoip-lite can resolve locations
  if ((!normalizedIp || isPrivateIp(normalizedIp)) && process.env.NODE_ENV !== 'production') {
    const devIps = ['151.38.39.1', '93.62.236.1', '2.39.170.1', '185.31.175.1', '8.8.8.8'];
    normalizedIp = devIps[Math.floor(Math.random() * devIps.length)];
  }

  if (!normalizedIp || isPrivateIp(normalizedIp)) {
    return { country: '', city: '', region: '' };
  }

  try {
    const geo = geoip.lookup(normalizedIp);
    const countryCode = geo?.country ?? '';
    let countryName = countryCode;
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      countryName = dn.of(countryCode) ?? countryCode;
    } catch { /* fallback to code */ }

    return {
      country: countryName,
      city: geo?.city ?? '',
      region: geo?.region ?? '',
    };
  } catch {
    return { country: '', city: '', region: '' };
  }
}

export function parseUserAgent(ua: string): { deviceType: string; browser: string; os: string } {
  if (!ua) return { deviceType: 'Desktop', browser: 'Unknown', os: 'Unknown' };

  let deviceType = 'Desktop';
  if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) deviceType = 'Mobile';
  else if (/Tablet|iPad|Android(?!.*Mobile)/i.test(ua)) deviceType = 'Tablet';

  let browser = 'Other';
  if (/Edg\//i.test(ua))               browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua))    browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung';
  else if (/Chrome\/\d/i.test(ua))     browser = 'Chrome';
  else if (/Firefox\/\d/i.test(ua))    browser = 'Firefox';
  else if (/Safari\/\d/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/MSIE|Trident/i.test(ua))   browser = 'IE';

  let os = 'Other';
  if (/Windows NT/i.test(ua))             os = 'Windows';
  else if (/iPhone|iPad|iPod/i.test(ua))  os = 'iOS';
  else if (/Android/i.test(ua))           os = 'Android';
  else if (/Mac OS X/i.test(ua))          os = 'macOS';
  else if (/CrOS/i.test(ua))              os = 'ChromeOS';
  else if (/Linux/i.test(ua))             os = 'Linux';

  return { deviceType, browser, os };
}

export function detectTrafficSource(referrer: string): string {
  if (!referrer) return 'direct';
  const r = referrer.toLowerCase();
  const internal = ['gentsallaku.it', 'localhost'];
  const search = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'baidu.', 'yandex.', 'ecosia.', 'ask.com', 'startpage.'];
  const social = ['facebook.', 't.co/', 'twitter.', 'x.com', 'instagram.', 'linkedin.', 'youtube.', 'tiktok.', 'reddit.', 'pinterest.', 'whatsapp.', 'telegram.', 'discord.'];
  if (internal.some(s => r.includes(s))) return 'internal';
  if (search.some(s => r.includes(s))) return 'search';
  if (social.some(s => r.includes(s))) return 'social';
  return 'referral';
}

/**
 * Priority: SPA-internal navigation > UTM parameters > referrer heuristics.
 * UTM wins over referrer because it states intent explicitly (e.g. a newsletter
 * link opened from Gmail would otherwise be classified as generic referral).
 */
export function resolveTrafficSource(navigationType: string, referrer: string, utmSource?: string): string {
  if (navigationType === 'internal') return 'internal';
  if (utmSource) {
    const s = utmSource.toLowerCase();
    const social = ['facebook', 'instagram', 'linkedin', 'twitter', 'x', 'tiktok', 'youtube', 'reddit', 'whatsapp', 'telegram'];
    const search = ['google', 'bing', 'yahoo', 'duckduckgo'];
    if (social.some(k => s.includes(k))) return 'social';
    if (search.some(k => s.includes(k))) return 'search';
    return 'campaign';
  }
  return detectTrafficSource(referrer);
}

/**
 * Strips query string/fragment (utm_*, fbclid, etc.) from a client-supplied path.
 * The frontend already sends a bare pathname, but this field is used as a
 * grouping key for analytics, so it can't rely on client behavior alone.
 */
export function normalizePath(path: string): string {
  return path.split('?')[0].split('#')[0].trim() || '/';
}

/** Replace dots (MongoDB path separator) and $ (operator prefix) — safe for field names. */
export function sanitizeKey(key: string): string {
  return key.replace(/\./g, '_').replace(/\$/g, '_');
}

export function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function prevMonthKey(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return toMonthKey(d);
}

/** Wrap a CSV field value in quotes and escape internal quotes. */
export function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
