import { describe, expect, it } from 'vitest';
import { LiveHandoffHistoryEntry, liveHandoffEntryRoute, liveHandoffEntryStatusKey, responseMinutes, splitLiveHandoffs } from './live-chat-list.util';

function entry(status: LiveHandoffHistoryEntry['status'], id: string = status): LiveHandoffHistoryEntry {
  return {
    requestId: id, sessionId: `s-${id}`, status, lastUserMessage: null, locale: null,
    requestedAt: '2026-10-18T10:00:00Z', expiresAt: '2026-10-18T10:15:00Z', respondedAt: null, closedAt: null,
  };
}

describe('splitLiveHandoffs', () => {
  it('separa le aperte dalle chiuse o scadute', () => {
    const { open, past } = splitLiveHandoffs([entry('closed'), entry('live'), entry('expired'), entry('requested')]);
    expect(open.map(e => e.status)).toEqual(['requested', 'live']);
    expect(past.map(e => e.status)).toEqual(['closed', 'expired']);
  });

  it('fra le aperte mette prima chi aspetta ancora una risposta, mantenendo l\'ordine del backend', () => {
    const { open } = splitLiveHandoffs([entry('live', 'a'), entry('notified', 'b'), entry('agent_joining', 'c'), entry('requested', 'd')]);
    expect(open.map(e => e.requestId)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('liveHandoffEntryStatusKey', () => {
  it('ha un\'etichetta per ogni stato', () => {
    expect(liveHandoffEntryStatusKey('requested')).toBe('live_handoff.card_waiting');
    expect(liveHandoffEntryStatusKey('notified')).toBe('live_handoff.card_waiting');
    expect(liveHandoffEntryStatusKey('agent_joining')).toBe('live_handoff.admin_joining');
    expect(liveHandoffEntryStatusKey('live')).toBe('live_handoff.admin_live');
    expect(liveHandoffEntryStatusKey('expired')).toBe('live_handoff.list_status_expired');
    expect(liveHandoffEntryStatusKey('closed')).toBe('live_handoff.list_status_closed');
  });
});

describe('responseMinutes', () => {
  it('misura i minuti tra richiesta e risposta, almeno 1', () => {
    expect(responseMinutes({ requestedAt: '2026-10-18T10:00:00Z', respondedAt: '2026-10-18T10:07:20Z' })).toBe(7);
    expect(responseMinutes({ requestedAt: '2026-10-18T10:00:00Z', respondedAt: '2026-10-18T10:00:10Z' })).toBe(1);
  });

  it('è null senza risposta o con date incoerenti', () => {
    expect(responseMinutes({ requestedAt: '2026-10-18T10:00:00Z', respondedAt: null })).toBeNull();
    expect(responseMinutes({ requestedAt: '2026-10-18T10:00:00Z', respondedAt: '2026-10-18T09:00:00Z' })).toBeNull();
    expect(responseMinutes({ requestedAt: 'x', respondedAt: 'y' })).toBeNull();
  });
});

describe('liveHandoffEntryRoute', () => {
  it('apre la sessione per sessionId, come la card della dashboard', () => {
    expect(liveHandoffEntryRoute({ sessionId: 'abc' })).toEqual(['/dashboard/live-chat', 'abc']);
  });
});
