import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const TITLE_PREFIX = '💬 ';
const BEEP_MIN_INTERVAL_MS = 3_000;

/**
 * Richiama l'attenzione dell'admin quando arriva qualcosa in una scheda che non sta guardando:
 * un prefisso nel titolo e un breve bip. Se la scheda è in primo piano non fa nulla, perché il
 * messaggio si vede già. Il prefisso sparisce da solo quando la scheda torna visibile.
 */
@Injectable({ providedIn: 'root' })
export class AdminAttentionService {
  private readonly document = inject(DOCUMENT);
  private lastBeepAt = 0;
  private listening = false;

  /** Da chiamare ad ogni evento che merita attenzione (es. messaggio di un visitatore). */
  notify(): void {
    if (!this.document.hidden) return;
    this.flashTitle();
    this.beep();
  }

  private flashTitle(): void {
    // Nessun doppio prefisso; il "(n)" delle notifiche admin sta davanti e non interferisce.
    if (!this.document.title.includes(TITLE_PREFIX)) {
      this.document.title = `${TITLE_PREFIX}${this.document.title}`;
    }
    if (this.listening) return;
    this.listening = true;
    const restore = () => {
      if (this.document.hidden) return;
      this.document.title = this.document.title.replace(TITLE_PREFIX, '');
      this.document.removeEventListener('visibilitychange', restore);
      this.listening = false;
    };
    this.document.addEventListener('visibilitychange', restore);
  }

  private beep(): void {
    const now = Date.now();
    if (now - this.lastBeepAt < BEEP_MIN_INTERVAL_MS) return;
    this.lastBeepAt = now;

    try {
      const Ctx = globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AudioCtor = Ctx.AudioContext ?? Ctx.webkitAudioContext;
      if (!AudioCtor) return;

      const ctx = new AudioCtor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.27);
      osc.onended = () => void ctx.close();
    } catch {
      // Audio bloccato dal browser (nessun gesto dell'utente) o non disponibile: il titolo basta.
    }
  }
}
