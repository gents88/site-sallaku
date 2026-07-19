import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Thin Handlebars wrapper for email templates.
 *
 * Templates live in `src/mail/templates` (copied to dist by the nest-cli
 * assets config). Partials in `templates/partials` are registered once at
 * startup under their file name (e.g. `stat-card.hbs` → `{{> stat-card}}`).
 *
 * Templates are logic-less by design: every derived value (bar widths, zebra
 * striping, formatted durations) is precomputed by the caller. Handlebars'
 * default {{...}} escaping also protects the email from HTML injection via
 * user-supplied values (contact names/messages, referrer URLs).
 */
@Injectable()
export class TemplateRendererService implements OnModuleInit {
  private readonly logger = new Logger(TemplateRendererService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');
  private readonly hbs = Handlebars.create();
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate>();

  onModuleInit(): void {
    this.registerPartials();
  }

  render(templateName: string, data: object): string {
    let template = this.compiled.get(templateName);
    if (!template) {
      const file = path.join(this.templatesDir, `${templateName}.hbs`);
      template = this.hbs.compile(fs.readFileSync(file, 'utf8'));
      this.compiled.set(templateName, template);
    }
    return template(data);
  }

  private registerPartials(): void {
    const partialsDir = path.join(this.templatesDir, 'partials');
    if (!fs.existsSync(partialsDir)) {
      this.logger.warn(`Partials directory not found: ${partialsDir}`);
      return;
    }
    for (const file of fs.readdirSync(partialsDir).filter(f => f.endsWith('.hbs'))) {
      const name = path.basename(file, '.hbs');
      this.hbs.registerPartial(name, fs.readFileSync(path.join(partialsDir, file), 'utf8'));
      this.logger.log(`Registered email partial "${name}"`);
    }
  }
}
