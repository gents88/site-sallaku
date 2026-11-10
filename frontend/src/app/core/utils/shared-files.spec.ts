import { describe, expect, it, vi } from 'vitest';
import { SHARE_INBOX_CACHE, takeSharedFiles, waitForLaunchFiles } from './shared-files';

/** CacheStorage minimale in memoria: abbastanza per verificare lettura, ordine e svuotamento. */
function fakeStorage(entries: { url: string; name: string; type: string; body: string }[] | null) {
  const store = new Map(entries?.map((e) => [e.url, e]) ?? []);
  let present = entries !== null;
  const cache = {
    keys: vi.fn(async () => [...store.keys()].map((url) => new Request(`https://x.test${url}`))),
    match: vi.fn(async (req: Request) => {
      const e = store.get(new URL(req.url).pathname);
      return e ? new Response(e.body, { headers: { 'Content-Type': e.type, 'X-File-Name': encodeURIComponent(e.name) } }) : undefined;
    }),
  };
  const storage = {
    has: vi.fn(async (name: string) => present && name === SHARE_INBOX_CACHE),
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => { present = false; return true; }),
  };
  return { storage: storage as unknown as Pick<CacheStorage, 'has' | 'open' | 'delete'>, spies: storage };
}

describe('takeSharedFiles', () => {
  it('senza CacheStorage o senza cache della condivisione: nessun file', async () => {
    expect(await takeSharedFiles(undefined)).toEqual([]);
    expect(await takeSharedFiles(fakeStorage(null).storage)).toEqual([]);
  });

  it('ricostruisce i file con nome (anche con accenti e spazi) e tipo, in ordine numerico', async () => {
    const { storage } = fakeStorage([
      { url: '/__share/10', name: 'decimo.txt', type: 'text/plain', body: 'dieci' },
      { url: '/__share/2', name: 'Relazione città.pdf', type: 'application/pdf', body: '%PDF' },
    ]);
    const files = await takeSharedFiles(storage);
    expect(files.map((f) => f.name)).toEqual(['Relazione città.pdf', 'decimo.txt']);
    expect(files[0].type).toBe('application/pdf');
    expect(await files[1].text()).toBe('dieci');
  });

  it('consuma la condivisione: la cache viene cancellata dopo la lettura', async () => {
    const { storage, spies } = fakeStorage([{ url: '/__share/0', name: 'a.pdf', type: 'application/pdf', body: 'x' }]);
    await takeSharedFiles(storage);
    expect(spies.delete).toHaveBeenCalledWith(SHARE_INBOX_CACHE);
    expect(await takeSharedFiles(storage)).toEqual([]);
  });
});

describe('waitForLaunchFiles', () => {
  it('senza launchQueue (browser non supportato): nessun file, subito', async () => {
    expect(await waitForLaunchFiles(undefined)).toEqual([]);
  });

  it('restituisce i file dei handle di "Apri con"', async () => {
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    const queue = { setConsumer: (c: (p: { files: { getFile(): Promise<File> }[] }) => void) => c({ files: [{ getFile: async () => file }] }) };
    expect(await waitForLaunchFiles(queue)).toEqual([file]);
  });

  it('app aperta in modo normale (il consumer non viene mai chiamato): scade senza file', async () => {
    vi.useFakeTimers();
    try {
      const pending = waitForLaunchFiles({ setConsumer: () => undefined }, 1500);
      await vi.advanceTimersByTimeAsync(1500);
      expect(await pending).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('un handle che non si riesce a leggere non blocca: nessun file', async () => {
    const queue = { setConsumer: (c: (p: { files: { getFile(): Promise<File> }[] }) => void) => c({ files: [{ getFile: async () => { throw new Error('denied'); } }] }) };
    expect(await waitForLaunchFiles(queue)).toEqual([]);
  });
});
