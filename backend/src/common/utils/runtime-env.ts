/**
 * Unica fonte di verità per "siamo in produzione?".
 *
 * Il Dockerfile imposta NODE_ENV=production, ma `npm run start:prod` imposta
 * NODE_ENV=prod (che serve anche a ConfigModule per leggere `.env.prod`).
 * Confrontare a mano con 'production' faceva sì che un avvio via start:prod
 * venisse trattato come sviluppo: Swagger esposto, messaggi d'errore interni
 * nelle risposte, CORS aperto senza CORS_ORIGIN e IP fittizi nella geo-analytics.
 */
const PRODUCTION_ALIASES = new Set(['production', 'prod']);

export function isProductionEnv(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return PRODUCTION_ALIASES.has((nodeEnv ?? '').trim().toLowerCase());
}
