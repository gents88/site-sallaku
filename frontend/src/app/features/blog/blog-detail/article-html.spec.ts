import { describe, expect, it } from 'vitest';
import { normalizeArticleHtml } from './article-html';

describe('normalizeArticleHtml', () => {
  it('trasforma gli h1 in h2', () => {
    expect(normalizeArticleHtml('<h1 id="a">Titolo</h1><p>x</p>')).toBe('<h2 id="a">Titolo</h2><p>x</p>');
  });
  it('non tocca tag che iniziano con h1 ma sono altro', () => {
    expect(normalizeArticleHtml('<h10>x</h10>')).toBe('<h10>x</h10>');
  });
  it('aggiunge alt vuoto alle immagini senza alt e lascia le altre', () => {
    expect(normalizeArticleHtml('<img src="a.png">')).toBe('<img alt="" src="a.png">');
    expect(normalizeArticleHtml('<img src="a.png" />')).toBe('<img alt="" src="a.png" />');
    expect(normalizeArticleHtml('<img src="a.png" alt="Grafico">')).toBe('<img src="a.png" alt="Grafico">');
    expect(normalizeArticleHtml('<img alt="" src="a.png">')).toBe('<img alt="" src="a.png">');
  });
  it('gestisce il testo vuoto', () => {
    expect(normalizeArticleHtml('')).toBe('');
  });
});
