import { describe, expect, it, vi } from 'vitest';
import { SHARE_INBOX_CACHE, SHARE_PATH } from './shared-files';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { File as NodeFile } from 'node:buffer';

/** Il service worker è un file JS in public/, fuori dal bundle: lo si legge come testo per eseguirlo in un sandbox. */
const swSource = readFileSync(resolve(process.cwd(), 'public/sw-custom.js'), 'utf8');

type Listener = (event: Record<string, unknown>) => void;

/** Esegue public/sw-custom.js con un `self`, una `caches` e un `importScripts` finti. */
function loadServiceWorker(initialKeys: string[] = []) {
  const listeners: Record<string, Listener[]> = {};
  const importOrder: string[] = [];
  const puts: { url: string; response: Response }[] = [];
  const deleted: string[] = [];
  const cache = {
    keys: async () => initialKeys.map((k) => new Request(`https://site.test${k}`)),
    delete: async (req: Request | string) => { deleted.push(typeof req === 'string' ? req : new URL(req.url).pathname); return true; },
    put: async (req: Request, response: Response) => { puts.push({ url: new URL(req.url).pathname, response }); },
  };
  const self = {
    location: { origin: 'https://site.test' },
    addEventListener: (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); importOrder.push(`listener:${type}`); },
  };
  const importScripts = vi.fn((src: string) => { importOrder.push(`import:${src}`); });
  const caches = { open: vi.fn(async () => cache) };
  new Function('self', 'importScripts', 'caches', swSource as string)(self, importScripts, caches);
  const fire = (request: Record<string, unknown>) => {
    const event = { request, respondWith: vi.fn(), stopImmediatePropagation: vi.fn() };
    listeners['fetch'].forEach((l) => l(event));
    return event;
  };
  return { fire, importScripts, importOrder, puts, deleted, caches };
}

/**
 * In jsdom `File` non è il Blob di Node, che è quello che `Response` accetta come corpo:
 * per questi test i file sono quelli nativi di Node (nel browser vero sono la stessa cosa).
 */
const nodeFile = (body: string, name: string, type: string) => new NodeFile([body], name, { type });

function shareRequest(files: unknown[], url = `https://site.test${SHARE_PATH}`) {
  // Un campo di testo (titolo condiviso) arriva come stringa insieme ai file e va scartato.
  const form = { getAll: (key: string) => (key === 'file' ? [...files, 'testo condiviso'] : []) };
  return { method: 'POST', url, formData: async () => form };
}

describe('public/sw-custom.js', () => {
  it('registra il gestore PRIMA di caricare il service worker di Angular (altrimenti Angular risponde per primo)', () => {
    const { importOrder, importScripts } = loadServiceWorker();
    expect(importScripts).toHaveBeenCalledWith('./ngsw-worker.js');
    expect(importOrder.indexOf('listener:fetch')).toBeLessThan(importOrder.indexOf('import:./ngsw-worker.js'));
  });

  it('usa gli stessi nomi di cache e percorso di shared-files.ts', () => {
    expect(swSource).toContain(`'${SHARE_PATH}'`);
    expect(swSource).toContain(`'${SHARE_INBOX_CACHE}'`);
  });

  it('POST di condivisione: salva i file, risponde con un 303 verso la pagina e blocca Angular', async () => {
    const sw = loadServiceWorker(['/__share/0']);
    const event = sw.fire(shareRequest([nodeFile('%PDF', 'a città.pdf', 'application/pdf')]));

    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    const response = (await (event.respondWith.mock.calls[0][0] as Promise<Response>));
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(`https://site.test${SHARE_PATH}?shared=1`);

    expect(sw.deleted).toEqual(['/__share/0']);
    expect(sw.puts).toHaveLength(1);
    expect(sw.puts[0].url).toBe('/__share/0');
    expect(sw.puts[0].response.headers.get('X-File-Name')).toBe(encodeURIComponent('a città.pdf'));
    expect(sw.puts[0].response.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('accetta al massimo 5 file e ignora i campi di testo del form', async () => {
    const sw = loadServiceWorker();
    const files = Array.from({ length: 8 }, (_, i) => nodeFile(String(i), `f${i}.txt`, 'text/plain'));
    const event = sw.fire(shareRequest(files));
    const response = await (event.respondWith.mock.calls[0][0] as Promise<Response>);
    expect(sw.puts).toHaveLength(5);
    expect(response.headers.get('Location')).toContain('shared=5');
  });

  it('se la lettura del form fallisce torna comunque alla pagina, con shared=0', async () => {
    const sw = loadServiceWorker();
    const event = sw.fire({ method: 'POST', url: `https://site.test${SHARE_PATH}`, formData: async () => { throw new Error('boom'); } });
    const response = await (event.respondWith.mock.calls[0][0] as Promise<Response>);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toContain('shared=0');
  });

  it.each([
    ['una GET sullo stesso percorso', { method: 'GET', url: `https://site.test${SHARE_PATH}` }],
    ['una POST ad altro percorso', { method: 'POST', url: 'https://site.test/api/v1/contact' }],
    ['una POST di un altro sito', { method: 'POST', url: `https://evil.test${SHARE_PATH}` }],
    ['un URL non valido', { method: 'POST', url: 'non un url' }],
  ])('lascia passare %s ad Angular senza toccarla', (_name, request) => {
    const sw = loadServiceWorker();
    const event = sw.fire(request);
    expect(event.respondWith).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
