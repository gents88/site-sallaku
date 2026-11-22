import { normalize, tokenize, topMatches } from './retrieval';
import { LAB_CATALOG } from './lab-catalog';

const tools = (q: string, n = 3) =>
  topMatches(q, LAB_CATALOG, (e) => ({ title: `${e.name} ${e.altNames}`, body: `${e.description} ${e.altText}` }), n).map((e) => e.path);

describe('retrieval', () => {
  it('normalizza accenti, maiuscole e "wi-fi"', () => {
    expect(normalize('Perché il Wi-Fi?')).toBe('perche il wifi?');
    expect(tokenize('Come posso ridurre il peso di un PDF?')).toEqual(['ridurre', 'peso', 'pdf']);
  });

  it('trova lo strumento giusto per le richieste più comuni, in più lingue', () => {
    expect(tools('voglio firmare un pdf')).toContain('/lab/sign-pdf');
    expect(tools('come riduco il peso di un pdf')).toContain('/lab/compress-pdf');
    expect(tools('convert heic photos from my iphone to jpg')).toContain('/lab/heic-to-jpg');
    expect(tools('crear un codigo qr para el wifi')[0]).toBe('/lab/wifi-qr-code');
    expect(tools('summarize a pdf')).toContain('/lab/pdf-summary');
  });

  it('non restituisce nulla se nessuna parola corrisponde', () => {
    expect(tools('qual è la capitale della Francia')).toEqual([]);
  });

  it('cerca anche negli articoli (titolo pesa più del testo)', () => {
    const posts = [
      { title: 'Angular signals', body: 'guida pratica' },
      { title: 'Come condividere il Wi-Fi con un QR code', body: 'guida' },
      { title: 'Guida ai moduli', body: 'qr code per il wifi' },
    ];
    const found = topMatches('qr code wifi', posts, (p) => p, 2);
    expect(found.map((p) => p.title)).toEqual(['Come condividere il Wi-Fi con un QR code', 'Guida ai moduli']);
  });
});
