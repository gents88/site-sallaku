import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { BlogService } from '../blog/blog.service';
import { ProjectsService } from '../projects/projects.service';
import { PageShellService } from './page-shell.service';

const MAX_SLUG_LENGTH = 200;

/**
 * Chiamato da Apache (vedi frontend/public/.htaccess) per `/blog/<slug>` e
 * `/projects/<slug>` che non hanno una pagina prerenderizzata. Risponde sempre
 * con la shell Angular, ma con 200 solo se lo slug esiste: gli slug inventati
 * danno 404 vero invece di una pagina vuota con 200 (soft 404 per Google).
 */
@ApiExcludeController()
@Controller('seo')
export class SeoController {
  constructor(
    private readonly blog: BlogService,
    private readonly projects: ProjectsService,
    private readonly shell: PageShellService,
  ) {}

  @Get('shell/:kind/:slug')
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  async shellFor(@Param('kind') kind: string, @Param('slug') slug: string, @Res() res: Response): Promise<void> {
    res.setHeader('Cache-Control', 'no-cache');

    const exists = await this.slugExists(kind, slug);
    const html = await this.shell.read();
    if (html === null) {
      // Senza shell non c'è nulla da servire: meglio un 503 ritentabile che un 404 sbagliato.
      res.status(503).setHeader('Retry-After', '60');
      res.type('text/plain').send('Service Unavailable');
      return;
    }
    res.status(exists ? 200 : 404).type('text/html').send(html);
  }

  private async slugExists(kind: string, slug: string): Promise<boolean> {
    if (!slug || slug.length > MAX_SLUG_LENGTH) return false;
    if (kind === 'blog') return this.blog.existsPublished(slug);
    if (kind === 'projects') return this.projects.existsBySlug(slug);
    return false;
  }
}
