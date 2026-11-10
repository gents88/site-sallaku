/*
 * Service worker del sito = quello di Angular (ngsw-worker.js) + la ricezione
 * dei file condivisi da altre app ("Condividi con…" su Android/Chrome).
 *
 * Il Web Share Target con file è una POST multipart verso /lab/open-file: il
 * service worker di Angular gestisce solo GET, quindi senza questo gestore la
 * POST arriverebbe al server statico e fallirebbe. Qui il file viene messo in
 * una cache temporanea e il browser viene rimandato (303) alla pagina, che lo
 * legge dalla cache, lo cancella e lo passa al workspace del Lab.
 *
 * Il file non lascia mai il dispositivo.
 *
 * Costanti da tenere uguali a core/utils/shared-files.ts (c'è un test che lo verifica).
 */
const SHARE_PATH = '/lab/open-file';
const SHARE_INBOX_CACHE = 'lab-share-inbox-v1';
const MAX_SHARED_FILES = 5;

// Registrato PRIMA di ngsw-worker.js: i gestori girano nell'ordine di
// registrazione, e stopImmediatePropagation impedisce a quello di Angular di
// rispondere a sua volta alla stessa richiesta.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || url.pathname !== SHARE_PATH) return;
  event.stopImmediatePropagation();
  event.respondWith(receiveSharedFiles(request));
});

async function receiveSharedFiles(request) {
  let received = 0;
  try {
    const form = await request.formData();
    const files = form.getAll('file').filter((f) => typeof f !== 'string').slice(0, MAX_SHARED_FILES);
    const cache = await caches.open(SHARE_INBOX_CACHE);
    // Una condivisione sostituisce la precedente non ancora letta.
    for (const key of await cache.keys()) await cache.delete(key);
    await Promise.all(
      files.map((file, i) =>
        cache.put(
          new Request(new URL(`/__share/${i}`, self.location.origin).href),
          new Response(file, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-File-Name': encodeURIComponent(file.name || `file-${i + 1}`),
            },
          }),
        ),
      ),
    );
    received = files.length;
  } catch {
    // Anche in caso di errore si torna alla pagina, che spiega che non è arrivato nulla.
  }
  return Response.redirect(new URL(`${SHARE_PATH}?shared=${received}`, self.location.origin).href, 303);
}

importScripts('./ngsw-worker.js');
