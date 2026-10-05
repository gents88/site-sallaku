import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { READING_HISTORY_KEY, READING_HISTORY_MAX, ReadingHistoryService } from './reading-history.service';

function create(platform: 'browser' | 'server' = 'browser') {
  TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: platform }] });
  return TestBed.inject(ReadingHistoryService);
}

describe('ReadingHistoryService', () => {
  // I file di spec condividono l'ambiente: niente residui di altri test.
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('records posts most-recent first, per language, and persists them', () => {
    const svc = create();
    svc.record({ slug: 'a', lang: 'it', title: 'A' });
    svc.record({ slug: 'b', lang: 'it', title: 'B' });
    svc.record({ slug: 'a-en', lang: 'en', title: 'A en' });
    expect(svc.forLang('it').map(e => e.slug)).toEqual(['b', 'a']);
    expect(svc.forLang('en').map(e => e.slug)).toEqual(['a-en']);
    expect(JSON.parse(localStorage.getItem(READING_HISTORY_KEY)!)).toHaveLength(3);
  });

  it('moves a re-read post back to the top instead of duplicating it', () => {
    const svc = create();
    svc.record({ slug: 'a', lang: 'it', title: 'A' });
    svc.record({ slug: 'b', lang: 'it', title: 'B' });
    svc.record({ slug: 'a', lang: 'it', title: 'A (nuovo titolo)' });
    expect(svc.forLang('it').map(e => e.title)).toEqual(['A (nuovo titolo)', 'B']);
  });

  it(`keeps at most ${READING_HISTORY_MAX} entries`, () => {
    const svc = create();
    for (let i = 0; i < READING_HISTORY_MAX + 5; i++) svc.record({ slug: `p${i}`, lang: 'it', title: `P${i}` });
    expect(svc.entries()).toHaveLength(READING_HISTORY_MAX);
    expect(svc.entries()[0].slug).toBe(`p${READING_HISTORY_MAX + 4}`);
  });

  it('restores the saved history and drops malformed entries', () => {
    localStorage.setItem(READING_HISTORY_KEY, JSON.stringify([{ slug: 'ok', lang: 'it', title: 'Ok', readAt: 1 }, { slug: 3 }, null]));
    expect(create().entries().map(e => e.slug)).toEqual(['ok']);
  });

  it('survives corrupted or blocked storage', () => {
    localStorage.setItem(READING_HISTORY_KEY, '{not json');
    const svc = create();
    expect(svc.entries()).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    svc.record({ slug: 'a', lang: 'it', title: 'A' });
    expect(svc.entries()).toHaveLength(1);
  });

  it('does nothing while prerendering', () => {
    const svc = create('server');
    svc.record({ slug: 'a', lang: 'it', title: 'A' });
    expect(svc.entries()).toEqual([]);
    expect(localStorage.getItem(READING_HISTORY_KEY)).toBeNull();
  });
});
