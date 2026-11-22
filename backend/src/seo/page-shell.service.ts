import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Legge la shell Angular (`index.csr.html`) dalla cartella servita da Apache.
 *
 * Serve a rispondere con lo status HTTP giusto per le pagine non prerenderizzate
 * (articoli/progetti nuovi o slug sbagliati): il contenuto è sempre la shell, ma
 * Apache non sa se lo slug esiste, il backend sì. Il file cambia a ogni deploy
 * del frontend, quindi la cache in memoria si invalida sulla data di modifica.
 */
@Injectable()
export class PageShellService {
  private readonly logger = new Logger(PageShellService.name);
  private readonly shellPath: string;
  private cached: { mtimeMs: number; html: string } | null = null;

  constructor(config: ConfigService) {
    // Sul server il frontend sta in ~/httpdocs. Il backend gira da
    // ~/app/backend/current (pm2, ecosystem.config.js): un percorso relativo alla
    // cwd puntava a ~/app/backend/httpdocs, inesistente, e ogni /blog/<slug> non
    // prerenderizzato rispondeva 503.
    this.shellPath =
      config.get<string>('FRONTEND_SHELL_PATH') || path.join(os.homedir(), 'httpdocs', 'index.csr.html');
  }

  /** La shell, o null se il file non è leggibile (es. ambiente senza frontend). */
  async read(): Promise<string | null> {
    try {
      const { mtimeMs } = await fs.stat(this.shellPath);
      if (this.cached?.mtimeMs !== mtimeMs) {
        this.cached = { mtimeMs, html: await fs.readFile(this.shellPath, 'utf8') };
      }
      return this.cached.html;
    } catch (err) {
      this.logger.error(`Shell frontend non leggibile (${this.shellPath}): ${(err as Error).message}`);
      return null;
    }
  }
}
