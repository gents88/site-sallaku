import { isCorsOriginAllowed } from './cors-origin';

describe('isCorsOriginAllowed', () => {
  const prod = { isProduction: true, allowedOrigins: ['https://gentsallaku.it'] };

  it('ammette le richieste senza Origin (server-to-server, curl)', () => {
    expect(isCorsOriginAllowed(undefined, prod)).toBe(true);
  });

  it('in produzione ammette solo le origini in allowlist', () => {
    expect(isCorsOriginAllowed('https://gentsallaku.it', prod)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example', prod)).toBe(false);
  });

  it('in produzione non confonde sottodomini o prefissi con l\'origine ammessa', () => {
    expect(isCorsOriginAllowed('https://gentsallaku.it.evil.example', prod)).toBe(false);
    expect(isCorsOriginAllowed('http://gentsallaku.it', prod)).toBe(false);
  });

  it('in produzione rifiuta anche le origini loopback', () => {
    expect(isCorsOriginAllowed('http://localhost:4200', prod)).toBe(false);
  });

  it('in produzione con allowlist vuota rifiuta tutto ciò che ha un Origin', () => {
    expect(isCorsOriginAllowed('https://gentsallaku.it', { isProduction: true, allowedOrigins: [] })).toBe(false);
  });

  it('in sviluppo senza allowlist ammette qualsiasi origine', () => {
    expect(isCorsOriginAllowed('https://qualunque.example', { isProduction: false, allowedOrigins: [] })).toBe(true);
  });

  it('in sviluppo con allowlist ammette le origini elencate e il loopback su qualsiasi porta', () => {
    const dev = { isProduction: false, allowedOrigins: ['https://uat.gentsallaku.it'] };
    expect(isCorsOriginAllowed('https://uat.gentsallaku.it', dev)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:4300', dev)).toBe(true);
    expect(isCorsOriginAllowed('http://127.0.0.1:4200', dev)).toBe(true);
    expect(isCorsOriginAllowed('http://[::1]:4200', dev)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example', dev)).toBe(false);
  });

  it('il loopback ammesso in sviluppo non include host che lo contengono soltanto come prefisso', () => {
    const dev = { isProduction: false, allowedOrigins: ['https://uat.gentsallaku.it'] };
    expect(isCorsOriginAllowed('http://localhost.evil.example', dev)).toBe(false);
  });
});
