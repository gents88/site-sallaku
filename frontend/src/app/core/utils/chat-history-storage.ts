/**
 * Cronologia della chat salvata in sessionStorage, così un ricaricamento della pagina non la svuota.
 *
 * sessionStorage e non localStorage di proposito: vale per la scheda e sparisce alla chiusura, come
 * l'identificativo di sessione della chat. Le conversazioni possono contenere dati personali e non
 * devono restare sul dispositivo dopo che il visitatore ha chiuso la scheda.
 *
 * Il contenuto dello storage non è fidato (può essere vecchio, troncato o modificato): ogni messaggio
 * viene validato e quelli malformati si scartano, invece di far rompere la chat.
 */
export interface StoredChatMessage {
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: Date;
  liveOffer?: boolean;
}

/** Quanti messaggi si conservano: la chat resta leggera e sotto la quota dello storage. */
export const MAX_STORED_MESSAGES = 60;
/** Lunghezza massima di un singolo messaggio salvato (le risposte molto lunghe vengono troncate). */
export const MAX_STORED_CONTENT = 4000;

const ROLES = new Set(['user', 'assistant', 'agent']);

function storageOrNull(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // accesso negato (privacy mode, iframe senza permessi)
  }
}

export function loadChatMessages(key: string): StoredChatMessage[] {
  const storage = storageOrNull();
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const messages: StoredChatMessage[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const { role, content, timestamp, liveOffer } = item as Record<string, unknown>;
      if (typeof role !== 'string' || !ROLES.has(role) || typeof content !== 'string') continue;
      const date = new Date(typeof timestamp === 'string' || typeof timestamp === 'number' ? timestamp : NaN);
      if (Number.isNaN(date.getTime())) continue;
      messages.push({
        role: role as StoredChatMessage['role'],
        content: content.slice(0, MAX_STORED_CONTENT),
        timestamp: date,
        ...(liveOffer === true ? { liveOffer: true } : {}),
      });
    }
    return messages.slice(-MAX_STORED_MESSAGES);
  } catch {
    return [];
  }
}

export function saveChatMessages(key: string, messages: readonly StoredChatMessage[]): void {
  const storage = storageOrNull();
  if (!storage) return;
  try {
    if (messages.length === 0) {
      storage.removeItem(key);
      return;
    }
    const compact = messages.slice(-MAX_STORED_MESSAGES).map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_STORED_CONTENT),
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
      ...(m.liveOffer ? { liveOffer: true } : {}),
    }));
    storage.setItem(key, JSON.stringify(compact));
  } catch {
    // Quota piena o storage non disponibile: la chat funziona lo stesso, solo non sopravvive al reload.
  }
}
