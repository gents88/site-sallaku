import type { Request, Response } from 'express';
import { isProductionEnv } from '../common/utils/runtime-env';

/**
 * Refresh token in cookie httpOnly (opzionale, AUTH_REFRESH_COOKIE=true).
 *
 * Con il token in localStorage qualsiasi XSS può esfiltrarlo; in un cookie
 * httpOnly JavaScript non lo legge. È disattivato di default perché oggi
 * frontend (gentsallaku.it) e API (*.up.railway.app) sono su siti diversi:
 * il cookie sarebbe di terze parti e Safari/ITP lo scarterebbe. Va acceso
 * quando l'API è sullo stesso sito (es. api.gentsallaku.it dopo la
 * migrazione Plesk), insieme a `authRefreshCookie: true` nell'environment
 * del frontend.
 */
export const REFRESH_COOKIE = 'gs_rt';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // = REFRESH_TOKEN_EXPIRY

export function refreshCookieEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_REFRESH_COOKIE === 'true';
}

function cookieOptions(env: NodeJS.ProcessEnv) {
  const sameSite = (env.AUTH_COOKIE_SAMESITE ?? 'strict').toLowerCase() as 'strict' | 'lax' | 'none';
  return {
    httpOnly: true,
    // SameSite=None è accettato dai browser solo con Secure.
    secure: isProductionEnv(env.NODE_ENV) || sameSite === 'none',
    sameSite,
    // Inviato solo alle rotte di autenticazione, non a ogni chiamata API.
    path: '/api/v1/auth',
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string, env: NodeJS.ProcessEnv = process.env): void {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(env), maxAge: REFRESH_COOKIE_MAX_AGE_MS });
}

export function clearRefreshCookie(res: Response, env: NodeJS.ProcessEnv = process.env): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(env));
}

/** Lettura senza cookie-parser: un solo cookie, formato standard `a=b; c=d`. */
export function readRefreshCookie(req: Pick<Request, 'headers'>): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/**
 * Applica la modalità cookie a una risposta di login/refresh: sposta il
 * refresh token nel cookie e lo toglie dal JSON. In modalità classica
 * restituisce la risposta invariata.
 */
export function applyRefreshCookie<T extends { refresh_token?: string }>(
  res: Response,
  body: T,
  env: NodeJS.ProcessEnv = process.env,
): T | Omit<T, 'refresh_token'> {
  if (!refreshCookieEnabled(env) || !body.refresh_token) return body;
  setRefreshCookie(res, body.refresh_token, env);
  const { refresh_token: _omit, ...rest } = body;
  return rest;
}
