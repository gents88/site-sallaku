/**
 * Classe su <html> (vedi src/index.html) che spegne le transizioni CSS durante
 * l'avvio: gli stili che cambiano tra il primo paint e la fine dell'hydration
 * si applicano di colpo invece di diventare centinaia di animazioni.
 */
export const BOOT_CLASS = 'is-booting';

/** Rete di sicurezza: se l'app non diventa mai stabile, le transizioni tornano comunque. */
export const BOOT_PHASE_MAX_MS = 8000;

interface BootPhaseOptions {
  maxMs?: number;
  raf?: (cb: () => void) => void;
}

/**
 * Toglie BOOT_CLASS quando tutte le `ready` sono concluse (anche se rifiutate)
 * oppure dopo `maxMs`, con due frame di margine: i cambi di stile dell'avvio
 * sono già applicati quando le transizioni tornano attive, quindi non ne parte
 * nessuna (togliere `transition: none` da solo non avvia transizioni).
 */
export function endBootPhaseWhenReady(doc: Document, ready: Promise<unknown>[], opts: BootPhaseOptions = {}): Promise<void> {
  const maxMs = opts.maxMs ?? BOOT_PHASE_MAX_MS;
  const raf = opts.raf ?? (cb => requestAnimationFrame(() => cb()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => { timer = setTimeout(resolve, maxMs); });
  const allReady = Promise.all(ready).then(() => undefined, () => undefined);

  return Promise.race([allReady, timeout]).then(() => {
    clearTimeout(timer);
    return new Promise<void>(resolve => raf(() => raf(() => {
      doc.documentElement.classList.remove(BOOT_CLASS);
      resolve();
    })));
  });
}

/** Si risolve all'evento load della finestra (subito se è già avvenuto): fogli di stile e font caricati. */
export function documentLoaded(doc: Document): Promise<void> {
  const win = doc.defaultView;
  if (doc.readyState === 'complete' || !win) return Promise.resolve();
  return new Promise(resolve => win.addEventListener('load', () => resolve(), { once: true }));
}
