import { detectImageKind } from './image-signature';

const pad = (head: number[] | string, total = 16): Buffer => {
  const b = Buffer.alloc(total);
  (typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head)).copy(b);
  return b;
};

describe('detectImageKind', () => {
  it('riconosce PNG', () => expect(detectImageKind(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png'));
  it('riconosce JPEG', () => expect(detectImageKind(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg'));
  it('riconosce WebP', () => {
    const b = pad('RIFF');
    b.write('WEBP', 8, 'latin1');
    expect(detectImageKind(b)).toBe('webp');
  });
  it('riconosce BMP', () => expect(detectImageKind(pad('BM'))).toBe('bmp'));
  it('riconosce TIFF little e big endian', () => {
    expect(detectImageKind(pad('II*\0'))).toBe('tiff');
    expect(detectImageKind(pad('MM\0*'))).toBe('tiff');
  });

  it('RIFF che non è WebP (es. WAV) non passa', () => {
    const b = pad('RIFF');
    b.write('WAVE', 8, 'latin1');
    expect(detectImageKind(b)).toBeNull();
  });

  it('rifiuta eseguibili, PDF, HTML e testo', () => {
    expect(detectImageKind(pad('MZ'))).toBeNull();
    expect(detectImageKind(pad('%PDF-1.7'))).toBeNull();
    expect(detectImageKind(pad('<html><body>'))).toBeNull();
    expect(detectImageKind(pad('hello world!!!!'))).toBeNull();
  });

  it('rifiuta buffer troppo corti o vuoti', () => {
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
    expect(detectImageKind(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
