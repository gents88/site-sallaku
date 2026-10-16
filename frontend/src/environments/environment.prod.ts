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
  // Refresh token in cookie httpOnly invece che in localStorage (backend:
  // AUTH_REFRESH_COOKIE=true). Da accendere solo quando l'API è sullo stesso
  // sito del frontend (es. api.gentsallaku.it): con *.up.railway.app il
  // cookie sarebbe di terze parti e Safari lo bloccherebbe.
  authRefreshCookie: false,
};
