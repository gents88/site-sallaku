/** Altezza navbar + buffer: una sezione è "attiva" quando il suo top supera questa linea. */
export const SCROLL_SPY_OFFSET = 120;

export interface SectionRect {
  id: string;
  top: number;
}

/**
 * Ultima sezione (in ordine DOM) il cui top ha superato la linea `offset`.
 * In fondo alla pagina vince l'ultima sezione anche se è troppo corta per
 * raggiungere la linea — altrimenti "Contatti" non si accenderebbe mai.
 */
export function pickActiveSection(
  sections: readonly SectionRect[],
  offset: number,
  atPageBottom: boolean,
  fallback = 'homepage',
): string {
  if (sections.length === 0) return fallback;
  if (atPageBottom) return sections[sections.length - 1].id;

  let active = fallback;
  for (const s of sections) {
    if (s.top <= offset) active = s.id;
  }
  return active;
}

export type BottomTab = 'home' | 'projects' | 'services' | 'other';

/**
 * Tab della bottom bar mobile da evidenziare. Sulla home segue lo scroll-spy;
 * fuori dalla home solo la pagina /projects ha una tab propria.
 */
export function bottomTabFor(isHomepage: boolean, activeSection: string, path = ''): BottomTab {
  if (!isHomepage) return path === '/projects' ? 'projects' : 'other';
  if (activeSection === 'homepage') return 'home';
  if (activeSection === 'projects') return 'projects';
  if (activeSection === 'services') return 'services';
  return 'other';
}

/**
 * Osserva le <section id> della homepage con una "linea" di 1px a `offset`
 * dal top (rootMargin): il callback scatta solo quando una sezione attraversa
 * la linea, non a ogni evento scroll — prima ogni scroll faceva 8
 * getBoundingClientRect() sincroni (layout thrashing).
 */
export class SectionScrollSpy {
  private observer: IntersectionObserver | null = null;
  private sections: HTMLElement[] = [];

  constructor(
    private readonly onChange: (activeId: string) => void,
    private readonly offset = SCROLL_SPY_OFFSET,
  ) {}

  /** (Ri)aggancia le sezioni presenti ora sotto `root`. Da richiamare dopo ogni navigazione verso la home e al resize. */
  attach(root: ParentNode): void {
    this.detach();
    this.sections = Array.from(root.querySelectorAll<HTMLElement>('section[id]'));
    if (this.sections.length === 0 || typeof IntersectionObserver === 'undefined') {
      this.recompute(false);
      return;
    }

    const bottomMargin = Math.max(0, window.innerHeight - this.offset - 1);
    this.observer = new IntersectionObserver(() => this.recompute(this.isAtPageBottom()), {
      rootMargin: `-${this.offset}px 0px -${bottomMargin}px 0px`,
      threshold: 0,
    });
    this.sections.forEach(s => this.observer!.observe(s));
    this.recompute(this.isAtPageBottom());
  }

  /** Chiamato dallo scroll handler (già throttlato a rAF) solo per il caso "fondo pagina". */
  checkBottom(): void {
    if (this.sections.length && this.isAtPageBottom()) this.recompute(true);
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.sections = [];
  }

  private recompute(atBottom: boolean): void {
    const rects = this.sections.map(el => ({ id: el.id, top: el.getBoundingClientRect().top }));
    this.onChange(pickActiveSection(rects, this.offset, atBottom));
  }

  private isAtPageBottom(): boolean {
    const doc = document.documentElement;
    return window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
  }
}
