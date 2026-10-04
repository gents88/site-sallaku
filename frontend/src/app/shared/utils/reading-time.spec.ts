import { describe, expect, it } from 'vitest';
import { estimateReadingMinutes } from './reading-time';

describe('estimateReadingMinutes', () => {
  it('returns at least 1 minute for empty or short content', () => {
    expect(estimateReadingMinutes('')).toBe(1);
    expect(estimateReadingMinutes(null)).toBe(1);
    expect(estimateReadingMinutes('<p>poche parole</p>')).toBe(1);
  });

  it('ignores HTML tags and rounds up at 200 words per minute', () => {
    const words = Array(450).fill('parola').join(' ');
    expect(estimateReadingMinutes(`<p>${words}</p>`)).toBe(3);
  });
});
