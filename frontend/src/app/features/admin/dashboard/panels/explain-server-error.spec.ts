import { describe, expect, it } from 'vitest';
import { explainServerError } from './explain-server-error';

const err = (name: string, message: string, route = '/api/v1/x', status = 500) => ({ name, message, route, status });

describe('explainServerError', () => {
  // L'errore reale che ha dato origine a questa funzione
  it('spiega il timeout del proxy della Ricerca PDF', () => {
    const r = explainServerError(err('TimeoutError', 'The operation was aborted due to timeout', '/api/v1/pdf-search/proxy'));
    expect(r.kind).toBe('passeggero');
    expect(r.text).toContain('troppo lentamente');
    expect(r.text).toContain('scaricamento di un PDF da una fonte esterna');
    expect(r.advice).toContain('si risolve da solo');
  });

  it.each([
    ['ECONNREFUSED connect', 'passeggero', 'collegarsi a un servizio esterno'],
    ['fetch failed', 'passeggero', 'collegarsi a un servizio esterno'],
    ['E11000 duplicate key error', 'da-guardare', 'esiste già'],
    ['Cast to ObjectId failed', 'da-guardare', 'formato atteso'],
    ['429 Too Many Requests', 'passeggero', 'limite'],
    ['ENOSPC: no space left on device', 'da-guardare', 'spazio su disco'],
    ['JavaScript heap out of memory', 'da-guardare', 'memoria'],
    ['EACCES: permission denied', 'da-guardare', 'permesso'],
  ])('riconosce "%s"', (message, kind, snippet) => {
    const r = explainServerError(err('Error', message));
    expect(r.kind).toBe(kind);
    expect(r.text).toContain(snippet);
  });

  it('distingue un indice mancante da un errore generico del database', () => {
    const idx = explainServerError(err('MongoServerError', 'text index required for $text query'));
    expect(idx.text).toContain('Manca un indice');
    const other = explainServerError(err('MongoServerError', 'Document failed validation'));
    expect(other.text).toContain('rifiutato');
  });

  it('riconosce i problemi del database', () => {
    const r = explainServerError(err('MongooseServerSelectionError', 'Could not connect to any servers'));
    expect(r.kind).toBe('da-guardare');
    expect(r.text).toContain('database');
  });

  it('un TypeError "Cannot read properties" è un bug da correggere, con invito a guardare lo stack', () => {
    const r = explainServerError(err('TypeError', "Cannot read properties of undefined (reading 'x')"));
    expect(r.kind).toBe('da-guardare');
    expect(r.text).toContain('Errore nel codice');
    expect(r.advice).toContain('stack');
  });

  it('dice di cosa si stava occupando la richiesta, dalla rotta', () => {
    expect(explainServerError(err('Error', 'fetch failed', '/api/v1/chatbot/message')).text).toContain('il chatbot');
    expect(explainServerError(err('Error', 'fetch failed', '/api/v1/contact')).text).toContain('il modulo di contatto');
  });

  it('un 503 senza altri indizi è un servizio non disponibile; un 500 sconosciuto resta generico', () => {
    expect(explainServerError(err('Error', 'boh', '/api/v1/x', 503)).kind).toBe('passeggero');
    const generic = explainServerError(err('Error', 'boh'));
    expect(generic.kind).toBe('da-guardare');
    expect(generic.text).toContain('non riconosco');
  });

  it('non fa mai uscire testo vuoto', () => {
    for (const e of [err('', ''), err('Error', ''), err('X', 'Y', '', 0)]) {
      const r = explainServerError(e);
      expect(r.text.length).toBeGreaterThan(10);
      expect(r.advice.length).toBeGreaterThan(10);
    }
  });
});
