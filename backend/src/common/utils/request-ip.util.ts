import { Request } from 'express';

/**
 * Best-effort client IP: trusts Express's own `req.ip` first (correct
 * whenever `trust proxy` is set, as it is in main.ts — Railway sits in
 * front of this app), falling back to X-Forwarded-For / the raw socket
 * only if that's somehow empty.
 */
export function clientIp(req: Request): string {
  if (req.ip) return req.ip;
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || req.socket?.remoteAddress || '';
}
