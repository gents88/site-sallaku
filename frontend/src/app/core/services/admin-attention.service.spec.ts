import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminAttentionService } from './admin-attention.service';

describe('AdminAttentionService', () => {
  let service: AdminAttentionService;
  let hidden = false;
  let oscillatorStarts: number;
  const realAudio = (globalThis as { AudioContext?: unknown }).AudioContext;

  beforeEach(() => {
    hidden = false;
    oscillatorStarts = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    document.title = 'Dashboard';
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });

    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      createOscillator() {
        const osc = {
          type: '', frequency: { value: 0 }, onended: null as null | (() => void),
          connect: (n: unknown) => n, start: () => { oscillatorStarts++; }, stop: () => undefined,
        };
        return osc;
      }
      createGain() {
        return { gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined }, connect: (n: unknown) => n };
      }
      close() { return Promise.resolve(); }
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;

    service = TestBed.inject(AdminAttentionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { AudioContext?: unknown }).AudioContext = realAudio;
    delete (document as { hidden?: boolean }).hidden;
    TestBed.resetTestingModule();
  });

  function showTab(): void {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('con la scheda in primo piano non fa nulla: il messaggio si vede già', () => {
    service.notify();

    expect(document.title).toBe('Dashboard');
    expect(oscillatorStarts).toBe(0);
  });

  it('con la scheda in background aggiunge il prefisso al titolo e suona', () => {
    hidden = true;

    service.notify();

    expect(document.title).toBe('💬 Dashboard');
    expect(oscillatorStarts).toBe(1);
  });

  it('non duplica il prefisso con più messaggi di fila', () => {
    hidden = true;

    service.notify();
    service.notify();
    service.notify();

    expect(document.title).toBe('💬 Dashboard');
  });

  it('suona al massimo una volta ogni 3 secondi', () => {
    hidden = true;

    service.notify();
    service.notify();
    expect(oscillatorStarts).toBe(1);

    vi.advanceTimersByTime(3_001);
    service.notify();
    expect(oscillatorStarts).toBe(2);
  });

  it('toglie il prefisso quando la scheda torna visibile', () => {
    hidden = true;
    service.notify();

    showTab();

    expect(document.title).toBe('Dashboard');
  });

  it('non tocca il resto del titolo, compreso il contatore delle notifiche', () => {
    document.title = '(3) Dashboard';
    hidden = true;
    service.notify();
    expect(document.title).toBe('💬 (3) Dashboard');

    showTab();

    expect(document.title).toBe('(3) Dashboard');
  });

  it('un nuovo messaggio dopo il ritorno in primo piano e un nuovo background ricomincia da capo', () => {
    hidden = true;
    service.notify();
    showTab();

    hidden = true;
    vi.advanceTimersByTime(3_001);
    service.notify();

    expect(document.title).toBe('💬 Dashboard');
    expect(oscillatorStarts).toBe(2);
  });

  it('se l\'audio non è disponibile il titolo funziona comunque e non lancia', () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    hidden = true;

    expect(() => service.notify()).not.toThrow();
    expect(document.title).toBe('💬 Dashboard');
  });

  it('se il browser blocca l\'audio (eccezione) non lancia', () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = class { constructor() { throw new Error('blocked'); } };
    hidden = true;

    expect(() => service.notify()).not.toThrow();
  });
});
