import type { Request } from 'express';
import { clientIp } from '../common/utils/request-ip.util';
import type { ClientContext } from './security.service';

/** IP e user agent della richiesta, per registro eventi e sessioni. */
export function clientContext(req: Request): ClientContext {
  const ua = req.headers?.['user-agent'];
  return { ip: clientIp(req), userAgent: (Array.isArray(ua) ? ua[0] : ua ?? '').slice(0, 200) };
}
