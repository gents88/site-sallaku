import { stripUnsafeImages } from './html-image-sanitizer';

describe('stripUnsafeImages', () => {
  it('rimuove il src di un immagine remota http', () => {
    const out = stripUnsafeImages('<p>x</p><img src="http://evil.internal/probe.png" alt="a">');

    expect(out).not.toContain('http://evil.internal');
    expect(out).toContain('<img');
    expect(out).toContain('alt="a"');
  });

  it('rimuove il src di un immagine remota https', () => {
    const out = stripUnsafeImages('<img src="https://example.com/x.png">');

    expect(out).not.toContain('https://example.com');
  });

  it('conserva una data URI PNG', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    const out = stripUnsafeImages(`<img src="${src}">`);

    expect(out).toContain(src);
  });

  it('conserva una data URI JPEG e WebP', () => {
    expect(stripUnsafeImages('<img src="data:image/jpeg;base64,/9j/">')).toContain('data:image/jpeg');
    expect(stripUnsafeImages('<img src="data:image/webp;base64,UklGR==">')).toContain('data:image/webp');
  });

  it('rimuove una data URI in un formato che scatena il loop infinito di image-size', () => {
    expect(stripUnsafeImages('<img src="data:image/x-icns;base64,AAAA">')).not.toContain('data:image/x-icns');
    expect(stripUnsafeImages('<img src="data:image/heif;base64,AAAA">')).not.toContain('data:image/heif');
    expect(stripUnsafeImages('<img src="data:image/jxl;base64,AAAA">')).not.toContain('data:image/jxl');
  });

  it('rimuove un img senza src, senza andare in errore', () => {
    expect(() => stripUnsafeImages('<img alt="niente src">')).not.toThrow();
  });

  it('gestisce più immagini nello stesso documento indipendentemente', () => {
    const html = '<img src="http://evil/a.png"><p>testo</p><img src="data:image/png;base64,AAA=">';
    const out = stripUnsafeImages(html);

    expect(out).not.toContain('http://evil');
    expect(out).toContain('data:image/png;base64,AAA=');
    expect(out).toContain('<p>testo</p>');
  });

  it('non tocca il resto del documento', () => {
    const html = '<div><h1>Titolo</h1><img src="http://x/y.png"><span>fine</span></div>';
    const out = stripUnsafeImages(html);

    expect(out).toContain('<h1>Titolo</h1>');
    expect(out).toContain('<span>fine</span>');
  });

  it('accetta apici singoli nell attributo src', () => {
    const out = stripUnsafeImages("<img src='http://evil/a.png'>");

    expect(out).not.toContain('http://evil');
  });

  it('lascia intatto un documento senza immagini', () => {
    const html = '<p>solo testo, nessuna immagine</p>';

    expect(stripUnsafeImages(html)).toBe(html);
  });

  it('rifiuta un tentativo di aggirare il filtro con maiuscole nel protocollo', () => {
    const out = stripUnsafeImages('<img src="HTTP://evil.internal/x.png">');

    expect(out).not.toContain('evil.internal');
  });

  it('rifiuta un protocollo diverso da data:, es. file:', () => {
    const out = stripUnsafeImages('<img src="file:///etc/passwd">');

    expect(out).not.toContain('file://');
  });
});
