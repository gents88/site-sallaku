import { describe, expect, it } from 'vitest';
import { rankRelated } from './related-content';

interface Item { id: string; tags?: string[]; date?: number }
const opts = { id: (i: Item) => i.id, tags: (i: Item) => i.tags, recency: (i: Item) => i.date ?? 0 };

describe('rankRelated', () => {
  const current: Item = { id: 'cur', tags: ['Angular', 'RxJS', 'SSR'] };

  it('ranks by number of shared tags, case-insensitively, excluding the current item', () => {
    const items: Item[] = [
      current,
      { id: 'one', tags: ['angular'], date: 3 },
      { id: 'two', tags: ['ANGULAR', 'ssr'], date: 1 },
      { id: 'none', tags: ['python'], date: 9 },
    ];
    expect(rankRelated(current, items, opts).map(i => i.id)).toEqual(['two', 'one', 'none']);
  });

  it('breaks ties with recency, then with the original order', () => {
    const items: Item[] = [
      { id: 'old', tags: ['rxjs'], date: 1 },
      { id: 'new', tags: ['rxjs'], date: 5 },
      { id: 'a', tags: [] },
      { id: 'b', tags: [] },
    ];
    expect(rankRelated(current, items, opts, 4).map(i => i.id)).toEqual(['new', 'old', 'a', 'b']);
  });

  it('fills up with the most recent items when nothing shares a tag', () => {
    const items: Item[] = [{ id: 'x', date: 1 }, { id: 'y', date: 3 }, { id: 'z', date: 2 }, { id: 'w', date: 0 }];
    expect(rankRelated({ id: 'cur' }, items, opts).map(i => i.id)).toEqual(['y', 'z', 'x']);
  });

  it('respects the limit and copes with empty input', () => {
    expect(rankRelated(current, [], opts)).toEqual([]);
    expect(rankRelated(current, [{ id: 'a' }, { id: 'b' }], opts, 1)).toHaveLength(1);
    expect(rankRelated(current, [{ id: 'a' }], opts, 0)).toEqual([]);
  });
});
