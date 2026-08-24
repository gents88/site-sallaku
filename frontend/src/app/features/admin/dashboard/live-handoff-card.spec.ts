import { describe, expect, it } from 'vitest';
import type { LiveHandoffSession } from './admin-dashboard.service';
import {
  activeLiveHandoffs,
  waitingLiveHandoffs,
  liveHandoffStatusKey,
  liveHandoffRoute,
} from './live-handoff-card.util';

/**
 * La card "Chat live" è la sola via per rientrare in una sessione da cui si è usciti:
 * se una chat già avviata non comparisse fra le "in corso", Gent resterebbe fuori
 * dalla propria conversazione senza alcun modo di tornarci dall'interfaccia.
 */
function session(status: LiveHandoffSession['status'], id = status): LiveHandoffSession {
  return {
    requestId: `req-${id}`,
    sessionId: `sess-${id}`,
    status,
    lastUserMessage: 'ciao',
    locale: 'it',
    requestedAt: '2026-08-23T10:00:00.000Z',
    expiresAt: '2026-08-23T10:15:00.000Z',
  };
}

describe('Card "Chat live" della dashboard', () => {
  const all: LiveHandoffSession[] = [
    session('requested'),
    session('notified'),
    session('agent_joining'),
    session('live'),
  ];

  describe('raggruppamento', () => {
    it('conta come "in corso" le sessioni già avviate — è il caso "sono uscito per sbaglio"', () => {
      expect(activeLiveHandoffs(all).map((s) => s.status)).toEqual(['agent_joining', 'live']);
    });

    it('conta come "in attesa" solo quelle a cui nessuno ha ancora risposto', () => {
      expect(waitingLiveHandoffs(all).map((s) => s.status)).toEqual(['requested', 'notified']);
    });

    it('ogni sessione finisce in esattamente un gruppo: nessuna sparisce dalla card', () => {
      const grouped = [...activeLiveHandoffs(all), ...waitingLiveHandoffs(all)];
      expect(grouped).toHaveLength(all.length);
      expect(new Set(grouped.map((s) => s.sessionId)).size).toBe(all.length);
    });

    it('regge una lista vuota senza errori', () => {
      expect(activeLiveHandoffs([])).toEqual([]);
      expect(waitingLiveHandoffs([])).toEqual([]);
    });

    it('non altera la lista di partenza', () => {
      const input = [...all];
      activeLiveHandoffs(input);
      waitingLiveHandoffs(input);
      expect(input).toEqual(all);
    });
  });

  describe('etichetta di stato', () => {
    it.each([
      ['live', 'live_handoff.admin_live'],
      ['agent_joining', 'live_handoff.admin_joining'],
      ['requested', 'live_handoff.card_waiting'],
      ['notified', 'live_handoff.card_waiting'],
    ] as const)('per lo stato "%s" usa la chiave %s', (status, expected) => {
      expect(liveHandoffStatusKey(session(status))).toBe(expected);
    });
  });

  describe('link di rientro', () => {
    it('punta al sessionId, perché è quello che la rotta admin si aspetta', () => {
      const s = session('live');
      expect(liveHandoffRoute(s)).toEqual(['/dashboard/live-chat', 'sess-live']);
    });

    it('non usa il requestId (scambiarli manderebbe su una sessione inesistente)', () => {
      const s = session('live');
      expect(liveHandoffRoute(s)[1]).not.toBe(s.requestId);
    });
  });
});
