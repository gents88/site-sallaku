export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api/v1',
  googleAnalyticsId: '',
  blogPdfUploadEnabled: true,
  // Public DSN — safe to expose client-side (Sentry client keys are not secrets).
  // Left empty in dev so Sentry.init() is skipped locally.
  sentryDsn: '',
  // Cloudflare Turnstile site key (public by design, safe to commit). Left
  // empty until configured — TurnstileWidgetComponent no-ops when blank,
  // matching the backend's TurnstileService no-op when the secret is unset.
  turnstileSiteKey: '',
  // Refresh token in cookie httpOnly invece che in localStorage (backend:
  // AUTH_REFRESH_COOKIE=true). Da accendere solo quando l'API è sullo stesso
  // sito del frontend (es. api.gentsallaku.it): con *.up.railway.app il
  // cookie sarebbe di terze parti e Safari lo bloccherebbe.
  authRefreshCookie: false,
};
