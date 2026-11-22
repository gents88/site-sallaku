/**
 * Riconosce il formato immagine dai primi byte. Il `mimetype` di un upload lo
 * dichiara il client (e `application/octet-stream` passa il filtro), quindi da
 * solo non dice cosa c'è davvero nel file.
 */
export type ImageKind = 'png' | 'jpeg' | 'webp' | 'bmp' | 'tiff';

export function detectImageKind(buf: Buffer): ImageKind | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  const tiff = buf.toString('latin1', 0, 4);
  if (tiff === 'II*\0' || tiff === 'MM\0*') return 'tiff';

  return null;
}
