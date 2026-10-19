import { normalizeLinkedinProfileUrl } from './linkedin-url';

describe('normalizeLinkedinProfileUrl', () => {
  const OK = 'https://www.linkedin.com/in/mario-rossi';

  it.each([
    'https://www.linkedin.com/in/mario-rossi',
    'https://www.linkedin.com/in/mario-rossi/',
    'http://linkedin.com/in/mario-rossi',
    'linkedin.com/in/mario-rossi',
    'www.linkedin.com/in/mario-rossi',
    'https://it.linkedin.com/in/mario-rossi',
    'HTTPS://WWW.LINKEDIN.COM/in/mario-rossi?utm_source=share&trk=abc#top',
    'https://www.linkedin.com/in/mario-rossi/details/experience/',
    '  https://www.linkedin.com/in/mario-rossi  ',
  ])('normalizza %s', input => {
    expect(normalizeLinkedinProfileUrl(input)).toBe(OK);
  });

  it('ricodifica gli slug con caratteri accentati', () => {
    expect(normalizeLinkedinProfileUrl('https://www.linkedin.com/in/j%C3%BCrgen-m%C3%BCller')).toBe(
      'https://www.linkedin.com/in/j%C3%BCrgen-m%C3%BCller',
    );
  });

  it.each([
    ['host che contiene linkedin.com ma non è LinkedIn', 'https://linkedin.com.evil.example/in/mario-rossi'],
    ['sottodominio di un altro dominio', 'https://www.linkedin.com.evil.example/in/mario-rossi'],
    ['dominio simile', 'https://notlinkedin.com/in/mario-rossi'],
    ['credenziali nell\'URL', 'https://user:pass@www.linkedin.com/in/mario-rossi'],
    ['porta esplicita', 'https://www.linkedin.com:8443/in/mario-rossi'],
    ['pagina aziendale', 'https://www.linkedin.com/company/acme'],
    ['post o link di condivisione', 'https://www.linkedin.com/posts/mario-rossi_x-123'],
    ['percorso /in senza slug', 'https://www.linkedin.com/in/'],
    ['slug troppo corto', 'https://www.linkedin.com/in/ab'],
    ['slug troppo lungo', `https://www.linkedin.com/in/${'a'.repeat(101)}`],
    ['caratteri non ammessi nello slug', 'https://www.linkedin.com/in/mario<script>'],
    ['schema non http', 'javascript://www.linkedin.com/in/mario-rossi'],
    ['ftp', 'ftp://www.linkedin.com/in/mario-rossi'],
    ['non è un URL', 'mario rossi'],
    ['stringa vuota', ''],
    ['solo spazi', '   '],
  ])('rifiuta: %s', (_label, input) => {
    expect(normalizeLinkedinProfileUrl(input)).toBeNull();
  });

  it('rifiuta valori non stringa', () => {
    expect(normalizeLinkedinProfileUrl(undefined)).toBeNull();
    expect(normalizeLinkedinProfileUrl(null)).toBeNull();
    expect(normalizeLinkedinProfileUrl(42)).toBeNull();
  });
});
