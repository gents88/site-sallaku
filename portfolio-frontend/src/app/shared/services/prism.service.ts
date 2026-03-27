import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PrismService {
  private loaded = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prism: any = null;

  private async load(): Promise<any> {
    if (this.loaded) return this.prism;

    // Prism core is imported in main.ts so window.Prism is guaranteed to exist
    // before any lazy chunk evaluates (fixes the toolbar IIFE ReferenceError).
    this.prism = (self as any).Prism;

    // Load language grammars
    await Promise.all([
      import('prismjs/components/prism-typescript'),
      import('prismjs/components/prism-javascript'),
      import('prismjs/components/prism-markup'),
      import('prismjs/components/prism-css'),
      import('prismjs/components/prism-bash'),
      import('prismjs/components/prism-json'),
      import('prismjs/components/prism-scss'),
    ]);

    // Load plugins in dependency order (line-numbers → toolbar → copy)
    await import('prismjs/plugins/line-numbers/prism-line-numbers');
    await import('prismjs/plugins/toolbar/prism-toolbar');
    await import('prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard');

    this.loaded = true;
    return this.prism;
  }

  async highlightAllUnder(el: HTMLElement): Promise<void> {
    const prism = await this.load();
    el.querySelectorAll('pre').forEach((pre) => {
      (pre as HTMLElement).classList.add('line-numbers');
    });
    prism.highlightAllUnder(el);
  }
}
