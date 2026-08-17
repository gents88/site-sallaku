import { Injectable } from '@angular/core';
import { loadStylesheetOnce } from '../../core/utils/load-stylesheet';
import { PRISM_CSS } from '../../core/utils/vendor-css.generated';

@Injectable({ providedIn: 'root' })
export class PrismService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pending: Promise<any> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private load(): Promise<any> {
    if (this.pending) return this.pending;

    this.pending = (async () => {
      // Prism core is loaded here rather than in main.ts so it stays out of
      // the initial bundle — only this route ever needs it.
      //
      // The ordering below is load-bearing: the plugin IIFEs (toolbar,
      // copy-to-clipboard) reference `Prism` as a free global variable and
      // throw a ReferenceError if it isn't set, so the global must be
      // assigned after the core resolves but before any plugin import
      // starts. Grammars are independent of each other, plugins depend on
      // the grammars being registered.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import('prismjs');
      const prism = mod.default ?? mod;
      (globalThis as any).Prism = prism;

      await Promise.all([
        import('prismjs/components/prism-typescript'),
        import('prismjs/components/prism-javascript'),
        import('prismjs/components/prism-markup'),
        import('prismjs/components/prism-css'),
        import('prismjs/components/prism-bash'),
        import('prismjs/components/prism-json'),
        import('prismjs/components/prism-scss'),
      ]);

      // Plugins in dependency order (line-numbers → toolbar → copy).
      await import('prismjs/plugins/line-numbers/prism-line-numbers');
      await import('prismjs/plugins/toolbar/prism-toolbar');
      await import('prismjs/plugins/copy-to-clipboard/prism-copy-to-clipboard');

      // Theme + plugin CSS, also no longer in the global bundle.
      await loadStylesheetOnce(PRISM_CSS);

      return prism;
    })();

    return this.pending;
  }

  async highlightAllUnder(el: HTMLElement): Promise<void> {
    // An article with no code blocks costs nothing: bail before pulling in
    // ~50KB of grammars and plugins that would have nothing to highlight.
    if (!el.querySelector('pre')) return;

    const prism = await this.load();
    el.querySelectorAll('pre').forEach((pre) => {
      (pre as HTMLElement).classList.add('line-numbers');
    });
    prism.highlightAllUnder(el);
  }
}
