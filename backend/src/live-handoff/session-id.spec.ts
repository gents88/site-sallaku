import { randomUUID } from 'crypto';
import { asSessionId } from './session-id';

describe('asSessionId', () => {
  it('accetta un UUID', () => {
    const id = randomUUID();
    expect(asSessionId(id)).toBe(id);
  });

  it('rifiuta oggetti con operatori Mongo', () => {
    expect(asSessionId({ $ne: null })).toBeNull();
    expect(asSessionId({ $gt: '' })).toBeNull();
    expect(asSessionId({ $regex: '.*' })).toBeNull();
  });

  it('rifiuta array, numeri, null e undefined', () => {
    expect(asSessionId(['a1b2c3d4e5'])).toBeNull();
    expect(asSessionId(123456789)).toBeNull();
    expect(asSessionId(null)).toBeNull();
    expect(asSessionId(undefined)).toBeNull();
  });

  it('rifiuta stringhe troppo corte, troppo lunghe o con caratteri speciali', () => {
    expect(asSessionId('short')).toBeNull();
    expect(asSessionId('a'.repeat(65))).toBeNull();
    expect(asSessionId('abc def ghi')).toBeNull();
    expect(asSessionId('abcdefgh$ne')).toBeNull();
    expect(asSessionId('../../etc/passwd')).toBeNull();
  });
});
