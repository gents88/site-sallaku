import { describe, expect, it } from 'vitest';
import { PaletteItem, filterLocal, mergeSections } from './palette-items';

const item = (id: string, section: PaletteItem['section'], title: string, detail?: string, url?: string): PaletteItem =>
  ({ id, section, title, detail, url, icon: 'x' });

describe('filterLocal', () => {
  const items = [item('a', 'actions', 'Nuovo articolo'), item('b', 'pages', 'Blog', 'Articoli tecnici'), item('c', 'pages', 'Lab')];

  it('matches every word against title and detail, case-insensitively', () => {
    expect(filterLocal(items, 'nuovo ART').map(i => i.id)).toEqual(['a']);
    expect(filterLocal(items, 'tecnici').map(i => i.id)).toEqual(['b']);
  });

  it('ranks titles that start with the query first', () => {
    const list = [item('x', 'pages', 'Il mio blog'), item('y', 'pages', 'Blog')];
    expect(filterLocal(list, 'blog').map(i => i.id)).toEqual(['y', 'x']);
  });

  it('returns everything for a blank query', () => {
    expect(filterLocal(items, '  ')).toHaveLength(3);
  });
});

describe('mergeSections', () => {
  it('orders actions → pages → content and drops duplicate destinations', () => {
    const merged = mergeSections(
      [item('p1', 'pages', 'Blog', undefined, '/blog')],
      [item('c1', 'content', 'Post', undefined, '/blog/x'), item('a1', 'actions', 'Tema')],
      [item('p2', 'pages', 'Blog bis', undefined, '/blog')],
    );
    expect(merged.map(i => i.id)).toEqual(['a1', 'p1', 'c1']);
  });
});
