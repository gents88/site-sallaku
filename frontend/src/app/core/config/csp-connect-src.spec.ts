import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La chat live apre un WebSocket verso il backend Railway. La CSP confronta anche
 * lo SCHEMA, quindi `connect-src https://host` NON autorizza `wss://host`: senza
 * la voce wss:// il browser blocca il socket con una violazione connect-src e la
 * chat resta bloccata su "Connessione in corso" per sempre — un guasto silenzioso,
 * invisibile in locale (dove la CSP di produzione non è applicata) e già costato
 * due giri di debug. Questi test bloccano la regressione.
 */
describe('CSP di deploy — connect-src', () => {
  const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
  const backendHost = 'portfolio-backend-production-e76d.up.railway.app';

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

    it('autorizza il backend su https (REST + polling Socket.IO)', () => {
      expect(connectSrcOf(csp!)).toContain(`https://${backendHost}`);
    });

    it('autorizza il backend su wss (WebSocket della chat live)', () => {
      expect(connectSrcOf(csp!)).toContain(`wss://${backendHost}`);
    });
  });

  describe('server.js (CSP del server SSR)', () => {
    const serverJs = readFileSync(join(repoRoot, 'server.js'), 'utf8');
    const csp = serverJs.match(/"connect-src [^"]+"/)?.[0] ?? '';

    it('autorizza il backend su https (REST + polling Socket.IO)', () => {
      expect(csp).toContain(`https://${backendHost}`);
    });

    it('autorizza il backend su wss (WebSocket della chat live)', () => {
      expect(csp).toContain(`wss://${backendHost}`);
    });
  });
});
