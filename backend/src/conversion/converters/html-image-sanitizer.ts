/**
 * Neutralizza gli <img> pericolosi prima che l'HTML raggiunga `html-to-docx`.
 *
 * Quella libreria, per ogni <img>, scarica gli URL remoti lato server e ne
 * misura le dimensioni con `image-size`. Su questo endpoint pubblico e senza
 * autenticazione, questo è già un SSRF (l'HTML arriva interamente da chi
 * chiama l'API, l'URL remoto compreso) — e `image-size` ha inoltre una
 * vulnerabilità nota, senza fix a monte al momento in cui scriviamo, che va
 * in loop infinito su file ICNS/JXL/HEIF malformati (CWE-835), bloccando
 * l'intero processo Node dato che il parsing è sincrono.
 *
 * Rimuoviamo perciò ogni <img> remoto (chiude l'SSRF) e accettiamo solo data
 * URI nei formati raster comuni (chiude il loop infinito, che riguarda solo
 * i formati esotici sopra). La feature persa è il caricamento di immagini nel
 * DOCX generato — accettabile per questo endpoint, non lo è esporre il
 * backend a SSRF/DoS.
 */

const SAFE_DATA_IMAGE_MIME = /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i;

/** Sostituisce ogni <img> con src non sicuro con un tag privo di src, lasciando intatto il resto del markup. */
export function stripUnsafeImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const src = srcMatch?.[1] ?? srcMatch?.[2] ?? '';
    if (SAFE_DATA_IMAGE_MIME.test(src)) return tag;
    return tag.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*')/i, '');
  });
}
