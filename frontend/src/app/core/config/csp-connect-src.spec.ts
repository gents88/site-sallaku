import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Il backend risponde sullo stesso host del sito (Apache su gentsallaku.it fa da
 * proxy per /api e /socket.io): le chiamate REST rientrano in 'self', ma per il
 * WebSocket della chat live non basta. La CSP confronta anche lo SCHEMA e non
 * tutti i browser (Safari in testa) considerano `wss://` dello stesso host
 * coperto da 'self': senza la voce wss:// esplicita il socket viene bloccato e la
 * chat resta su "Connessione in corso" per sempre — un guasto silenzioso,
 * invisibile in locale (dove la CSP di produzione non è applicata) e già costato
 * due giri di debug. Questi test bloccano la regressione.
 */
describe('CSP di deploy — connect-src', () => {
  const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
  const backendHost = 'gentsallaku.it';

  function connectSrcOf(csp: string): string {
    const directive = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src'));
    expect(directive, 'la CSP deve dichiarare una direttiva connect-src').toBeDefined();
    return directive!;
  }

  describe('frontend/public/.htaccess (CSP realmente servita da Apache in produzione)', () => {
    const htaccess = readFileSync(join(repoRoot, 'frontend', 'public', '.htaccess'), 'utf8');
    const csp = htaccess.match(/Header always set Content-Security-Policy "([^"]+)"/)?.[1];

    it('dichiara una CSP', () => {
      expect(csp).toBeDefined();
    });

    it("autorizza il backend sullo stesso host ('self': REST + polling Socket.IO)", () => {
      expect(connectSrcOf(csp!)).toContain("'self'");
    });

    it('autorizza il backend su wss (WebSocket della chat live)', () => {
      expect(connectSrcOf(csp!)).toContain(`wss://${backendHost}`);
    });

    it('non punta più al vecchio backend Railway', () => {
      expect(csp).not.toContain('railway.app');
    });
  });

  describe('server.js (CSP del server SSR)', () => {
    const serverJs = readFileSync(join(repoRoot, 'server.js'), 'utf8');
    const csp = serverJs.match(/"connect-src [^"]+"/)?.[0] ?? '';

    it("autorizza il backend sullo stesso host ('self': REST + polling Socket.IO)", () => {
      expect(csp).toContain("'self'");
    });

    it('autorizza il backend su wss (WebSocket della chat live)', () => {
      expect(csp).toContain(`wss://${backendHost}`);
    });
  });
});
