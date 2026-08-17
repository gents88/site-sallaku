export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api/v1',
  googleAnalyticsId: '',
  blogPdfUploadEnabled: true,
  // Public DSN — safe to expose client-side (Sentry client keys are not secrets).
  // Left empty in dev so Sentry.init() is skipped locally.
  sentryDsn: '',
};
