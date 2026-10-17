import { describe, expect, it } from 'vitest';
import { LocalDatePipe } from './local-date.pipe';

describe('LocalDatePipe', () => {
  const pipe = new LocalDatePipe();
  const iso = '2026-08-15T10:00:00.000Z';

  it('scrive la data nella lingua del sito, non in inglese fisso', () => {
    expect(pipe.transform(iso, 'it')).toBe('15 ago 2026');
    expect(pipe.transform(iso, 'it', 'long')).toBe('15 agosto 2026');
    expect(pipe.transform(iso, 'de', 'long')).toBe('15. August 2026');
    expect(pipe.transform(iso, 'en')).toBe('Aug 15, 2026');
  });

  it('restituisce stringa vuota per valori assenti o non validi', () => {
    expect(pipe.transform(null, 'it')).toBe('');
    expect(pipe.transform(undefined, 'it')).toBe('');
    expect(pipe.transform('non-una-data', 'it')).toBe('');
  });
});
