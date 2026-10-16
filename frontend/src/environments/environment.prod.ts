export const environment = {
  production: true,
  // Relativo: Apache su gentsallaku.it fa da proxy verso il backend (regole in
  // public/.htaccess). Il prerender usa SERVER_API_BASE_URL (app.config.server.ts).
  apiUrl: '/api/v1',
  // Replace with your real GA4 Measurement ID (format: G-XXXXXXXXXX)
  googleAnalyticsId: 'G-ENE1XXREY6',
  blogPdfUploadEnabled: true,
  // Replace with your real Sentry DSN once the project is created (public key, safe to commit).
  // Left empty until then — Sentry.init() no-ops on an empty DSN.
  sentryDsn: '',
  turnstileSiteKey: '',
  // Refresh token in cookie httpOnly invece che in localStorage: un XSS non lo
  // può leggere. Va in coppia con AUTH_REFRESH_COOKIE=true nel backend
  // (~/app/shared/backend.env sul server). Possibile da quando l'API è sullo
  // stesso host del sito (/api/v1 via proxy), quindi il cookie è di prima parte.
  authRefreshCookie: true,
};
