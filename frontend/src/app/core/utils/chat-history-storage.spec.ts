import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_STORED_CONTENT, MAX_STORED_MESSAGES, loadChatMessages, saveChatMessages, StoredChatMessage } from './chat-history-storage';

const KEY = 'chat_test_key';
const msg = (role: StoredChatMessage['role'], content: string, iso = '2026-10-22T10:00:00.000Z', extra: Partial<StoredChatMessage> = {}): StoredChatMessage =>
  ({ role, content, timestamp: new Date(iso), ...extra });

describe('chat-history-storage', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('salva e rilegge i messaggi con le date come Date', () => {
    saveChatMessages(KEY, [msg('user', 'ciao'), msg('assistant', 'Ciao! Come posso aiutarti?', '2026-10-22T10:00:05.000Z')]);

    const loaded = loadChatMessages(KEY);

    expect(loaded).toHaveLength(2);
    expect(loaded[0]).toEqual(msg('user', 'ciao'));
    expect(loaded[1].timestamp).toBeInstanceOf(Date);
    expect(loaded[1].timestamp.toISOString()).toBe('2026-10-22T10:00:05.000Z');
  });

  it('conserva liveOffer solo quando è vero', () => {
    saveChatMessages(KEY, [msg('assistant', 'vuoi parlare con Gent?', undefined, { liveOffer: true }), msg('assistant', 'altro', undefined, { liveOffer: false })]);

    const [a, b] = loadChatMessages(KEY);

    expect(a.liveOffer).toBe(true);
    expect(b).not.toHaveProperty('liveOffer');
  });

  it('senza nulla salvato restituisce un elenco vuoto', () => {
    expect(loadChatMessages(KEY)).toEqual([]);
  });

  it('salvare un elenco vuoto cancella la chiave', () => {
    saveChatMessages(KEY, [msg('user', 'ciao')]);
    expect(sessionStorage.getItem(KEY)).not.toBeNull();

    saveChatMessages(KEY, []);

    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('tiene solo gli ultimi MAX_STORED_MESSAGES messaggi', () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 15 }, (_, i) => msg('user', `m${i}`));

    saveChatMessages(KEY, many);
    const loaded = loadChatMessages(KEY);

    expect(loaded).toHaveLength(MAX_STORED_MESSAGES);
    expect(loaded[0].content).toBe('m15');
    expect(loaded.at(-1)!.content).toBe(`m${MAX_STORED_MESSAGES + 14}`);
  });

  it('tronca i messaggi più lunghi di MAX_STORED_CONTENT', () => {
    saveChatMessages(KEY, [msg('assistant', 'x'.repeat(MAX_STORED_CONTENT + 500))]);

    expect(loadChatMessages(KEY)[0].content).toHaveLength(MAX_STORED_CONTENT);
  });

  describe('contenuto non fidato', () => {
    it.each([
      ['JSON non valido', '{non json'],
      ['un oggetto invece di un array', '{"role":"user"}'],
      ['null', 'null'],
      ['un numero', '42'],
    ])('%s → elenco vuoto, senza lanciare', (_label, raw) => {
      sessionStorage.setItem(KEY, raw);
      expect(loadChatMessages(KEY)).toEqual([]);
    });

    it('scarta i messaggi malformati e tiene quelli buoni', () => {
      sessionStorage.setItem(KEY, JSON.stringify([
        { role: 'user', content: 'ok', timestamp: '2026-10-22T10:00:00.000Z' },
        { role: 'admin', content: 'ruolo inventato', timestamp: '2026-10-22T10:00:00.000Z' },
        { role: 'user', content: 123, timestamp: '2026-10-22T10:00:00.000Z' },
        { role: 'user', content: 'data rotta', timestamp: 'non-una-data' },
        { role: 'assistant', content: 'senza data' },
        null,
        'testo',
        { role: 'assistant', content: 'anche questo ok', timestamp: '2026-10-22T10:00:01.000Z' },
      ]));

      expect(loadChatMessages(KEY).map((m) => m.content)).toEqual(['ok', 'anche questo ok']);
    });

    it('non interpreta HTML o script: il contenuto resta testo', () => {
      sessionStorage.setItem(KEY, JSON.stringify([{ role: 'assistant', content: '<img src=x onerror=alert(1)>', timestamp: '2026-10-22T10:00:00.000Z' }]));

      expect(loadChatMessages(KEY)[0].content).toBe('<img src=x onerror=alert(1)>');
    });

    it('un liveOffer che non è esattamente true viene ignorato', () => {
      sessionStorage.setItem(KEY, JSON.stringify([{ role: 'assistant', content: 'x', timestamp: '2026-10-22T10:00:00.000Z', liveOffer: 'true' }]));

      expect(loadChatMessages(KEY)[0]).not.toHaveProperty('liveOffer');
    });
  });

  describe('storage non disponibile', () => {
    it('se salvare lancia (quota piena) la chat non si rompe', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(() => saveChatMessages(KEY, [msg('user', 'ciao')])).not.toThrow();
    });

    it('se leggere lancia restituisce un elenco vuoto', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('negato');
      });

      expect(loadChatMessages(KEY)).toEqual([]);
    });
  });
});
