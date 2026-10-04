export const environment = {
  production: false,
  apiUrl: 'https://portfolio-backend-uat.up.railway.app/api/v1',
  googleAnalyticsId: '',
  blogPdfUploadEnabled: true,
  sentryDsn: '',
  turnstileSiteKey: '',
  // Refresh token in cookie httpOnly invece che in localStorage (backend:
  // AUTH_REFRESH_COOKIE=true). Da accendere solo quando l'API è sullo stesso
  // sito del frontend (es. api.gentsallaku.it): con *.up.railway.app il
  // cookie sarebbe di terze parti e Safari lo bloccherebbe.
  authRefreshCookie: false,
};
