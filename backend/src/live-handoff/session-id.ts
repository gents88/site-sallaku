/**
 * I messaggi WebSocket non passano dal ValidationPipe HTTP: `sessionId` può
 * arrivare come oggetto. Passato a `findOne({ sessionId })`, `{"$ne": null}`
 * diventa un operatore Mongo e seleziona la prima sessione qualsiasi (con
 * `visitor_close` un anonimo avrebbe potuto chiudere la chat di un altro).
 * Si accetta solo una stringa con la forma degli ID generati (UUID e simili).
 */
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function asSessionId(value: unknown): string | null {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value) ? value : null;
}
