/**
 * Finestra scorrevole per socket. Il throttler HTTP non vede i messaggi
 * WebSocket: senza questo un visitatore anonimo può inviare `visitor_message`
 * senza limite, e ognuno è una scrittura su MongoDB più un broadcast.
 *
 * Lo stato sta in memoria del processo ed è per socket: sparisce con la
 * disconnessione (`forget`), quindi non cresce nel tempo.
 */
export class SocketRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Registra un evento e dice se è consentito. Un evento rifiutato non allunga la finestra. */
  allow(socketId: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(socketId) ?? []).filter((ts) => t - ts < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(socketId, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(socketId, recent);
    return true;
  }

  forget(socketId: string): void {
    this.hits.delete(socketId);
  }
}
