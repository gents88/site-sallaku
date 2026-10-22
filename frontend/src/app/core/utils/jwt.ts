/**
 * Scadenza di un JWT in millisecondi epoch, letta dal claim `exp` senza verificare la firma
 * (la verifica spetta al server: qui serve solo sapere se conviene rinnovare il token prima
 * di usarlo, per esempio nell'handshake di un WebSocket dove un 401 non fa partire il refresh).
 * Restituisce null se il token non è un JWT leggibile o non ha `exp`.
 */
export function jwtExpiresAt(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const exp = (JSON.parse(atob(base64)) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
