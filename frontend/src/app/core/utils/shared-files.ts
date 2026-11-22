import { InjectionToken } from '@angular/core';

/**
 * File che arrivano al Lab da fuori della pagina:
 *  - "Condividi con…" (Web Share Target): lo riceve public/sw-custom.js, che lo
 *    parcheggia in una cache temporanea; qui lo si legge e lo si cancella.
 *  - "Apri con" (File Handling API, Chrome desktop): arriva da `launchQueue`.
 */

/** Uguali a public/sw-custom.js (un test lo verifica): il service worker non può importare questo file. */
export const SHARE_INBOX_CACHE = 'lab-share-inbox-v1';
export const SHARE_PATH = '/lab/open-file';

type CacheStorageLike = Pick<CacheStorage, 'has' | 'open' | 'delete'>;

/** Legge i file condivisi in attesa e svuota la cache: ogni condivisione si consuma una volta sola. */
export async function takeSharedFiles(storage: CacheStorageLike | undefined): Promise<File[]> {
  if (!storage || !(await storage.has(SHARE_INBOX_CACHE))) return [];
  const cache = await storage.open(SHARE_INBOX_CACHE);
  try {
    const requests = [...(await cache.keys())].sort((a, b) => a.url.localeCompare(b.url, undefined, { numeric: true }));
    const files: File[] = [];
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;
      // arrayBuffer e non blob(): il Blob della Response non è sempre quello del
      // File (jsdom/Node 20 lo trasformano in "[object Blob]"); i byte vanno bene ovunque.
      const bytes = await response.arrayBuffer();
      const type = response.headers.get('Content-Type') ?? '';
      files.push(new File([bytes], safeDecode(response.headers.get('X-File-Name')) || 'file', { type }));
    }
    return files;
  } finally {
    await storage.delete(SHARE_INBOX_CACHE);
  }
}

function safeDecode(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

interface LaunchParamsLike {
  files?: { getFile(): Promise<File> }[];
}
export interface LaunchQueueLike {
  setConsumer(consumer: (params: LaunchParamsLike) => void | Promise<void>): void;
}

/**
 * File con cui l'app installata è stata aperta ("Apri con"). Il consumer non
 * viene chiamato se l'app si è aperta in modo normale: dopo `timeoutMs` si
 * considera che non ci siano file, invece di restare in attesa.
 */
export function waitForLaunchFiles(queue: LaunchQueueLike | undefined, timeoutMs = 1500): Promise<File[]> {
  if (!queue) return Promise.resolve([]);
  return new Promise<File[]>((resolve) => {
    const timer = setTimeout(() => resolve([]), timeoutMs);
    queue.setConsumer(async (params) => {
      clearTimeout(timer);
      try {
        resolve(await Promise.all((params.files ?? []).map((handle) => handle.getFile())));
      } catch {
        resolve([]);
      }
    });
  });
}

/** Letture iniettabili: i test le sostituiscono senza dover spiare gli export del modulo. */
export const TAKE_SHARED_FILES = new InjectionToken<() => Promise<File[]>>('TAKE_SHARED_FILES', {
  providedIn: 'root',
  factory: () => () => takeSharedFiles(typeof caches === 'undefined' ? undefined : caches),
});

export const WAIT_LAUNCH_FILES = new InjectionToken<() => Promise<File[]>>('WAIT_LAUNCH_FILES', {
  providedIn: 'root',
  factory: () => () => waitForLaunchFiles((window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue),
});
