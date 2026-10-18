import { averageResponseHours, effectiveLeadStatus, endOfTodayRome } from './lead';

describe('effectiveLeadStatus', () => {
  it('usa lo stato salvato se valido', () => {
    expect(effectiveLeadStatus({ status: 'won' })).toBe('won');
  });

  it('i messaggi vecchi senza stato: risposti = in trattativa, gli altri nuovi', () => {
    expect(effectiveLeadStatus({ repliedAt: new Date() })).toBe('in_progress');
    expect(effectiveLeadStatus({})).toBe('new');
    expect(effectiveLeadStatus({ status: 'boh' })).toBe('new');
  });
});

describe('averageResponseHours', () => {
  it('media delle sole risposte, in ore con un decimale', () => {
    expect(
      averageResponseHours([
        { createdAt: '2026-10-01T10:00:00Z', repliedAt: '2026-10-01T12:00:00Z' },
        { createdAt: '2026-10-02T10:00:00Z', repliedAt: '2026-10-02T15:00:00Z' },
        { createdAt: '2026-10-03T10:00:00Z', repliedAt: null },
      ]),
    ).toBe(3.5);
  });

  it('null senza risposte', () => {
    expect(averageResponseHours([{ createdAt: '2026-10-01T10:00:00Z' }])).toBeNull();
  });
});

describe('endOfTodayRome', () => {
  it('fine giornata a Roma in ora legale (UTC+2)', () => {
    expect(endOfTodayRome(new Date('2026-07-10T08:00:00Z')).toISOString()).toBe('2026-07-10T21:59:59.999Z');
  });

  it('fine giornata a Roma in ora solare (UTC+1), anche a tarda sera UTC', () => {
    expect(endOfTodayRome(new Date('2026-12-10T23:30:00Z')).toISOString()).toBe('2026-12-11T22:59:59.999Z');
  });
});
