import { describe, expect, it } from 'vitest';
import { COLLAPSIBLE_SECTIONS, loadOpenSections, saveOpenSections } from './dashboard-sections';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => { value = v; },
    get value() { return value; },
  };
}

describe('dashboard-sections', () => {
  it('alla prima visita sono tutte chiuse (in alto restano numeri chiave e cose da fare)', () => {
    expect([...loadOpenSections(memoryStorage())]).toEqual([]);
  });

  it('ricorda le sezioni lasciate aperte', () => {
    const storage = memoryStorage();
    saveOpenSections(new Set(['dash-ops', 'dash-chat']), storage);
    expect([...loadOpenSections(storage)]).toEqual(['dash-ops', 'dash-chat']);
  });

  it('con un valore corrotto o uno storage che lancia errori riparte da tutte chiuse', () => {
    expect(loadOpenSections(memoryStorage('{non json')).size).toBe(0);
    const broken = { getItem: () => { throw new Error('blocked'); } };
    expect(loadOpenSections(broken).size).toBe(0);
    expect(() => saveOpenSections(new Set(), { setItem: () => { throw new Error('full'); } })).not.toThrow();
  });
});
