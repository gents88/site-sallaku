import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Icone di navigazione come SVG inline a tratto (24×24, stroke currentColor).
 *
 * Sostituiscono le emoji di sidebar/palette: le emoji cambiano resa da un OS
 * all'altro (su Windows nella rail collassata erano illeggibili) e non
 * seguono il colore del tema. Il font Material Icons non è un'alternativa:
 * è un subset di ~6KB con i soli glifi già usati nei template (vedi
 * scripts/subset-icon-fonts.py), e ogni icona nuova richiederebbe di
 * rigenerarlo. Ogni valore è il contenuto di un <svg viewBox="0 0 24 24">.
 */
export const NAV_ICONS: Record<string, string> = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5v-5h4v5h4.5V10"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.3-3.8 4.2-5.6 7.5-5.6s6.2 1.8 7.5 5.6"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c1-3.2 3.3-4.8 6-4.8s5 1.6 6 4.8"/><path d="M15.5 5.6a3 3 0 0 1 0 5.8"/><path d="M17.5 14.9c1.7.6 2.9 2 3.5 4.6"/>',
  layers: '<path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/>',
  timeline: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8"/><path d="M11 6h9"/><path d="M11 18h9"/><path d="M11 12h6"/>',
  sparkles: '<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 15.5 19.2 17.8 21.5 18.5 19.2 19.2 18.5 21.5 17.8 19.2 15.5 18.5 17.8 17.8z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  inbox: '<path d="M4 13.5 6.5 5h11l2.5 8.5V19H4z"/><path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/>',
  send: '<path d="M21 3.5 10 14"/><path d="M21 3.5 14.5 20.5 10 14 3.5 9.5z"/>',
  chat: '<path d="M20 15.5a2 2 0 0 1-2 2H9l-4.5 3.5V6.5a2 2 0 0 1 2-2H18a2 2 0 0 1 2 2z"/><path d="M8.5 9h7M8.5 12.5h4.5"/>',
  article: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>',
  star: '<path d="m12 4 2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.8-5 2.8 1-5.6-4.1-3.9 5.6-.7z"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z"/>',
  flask: '<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5.5L5 18.5a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L13.5 9V3.5"/><path d="M7.5 14.5h9"/>',
  rocket: '<path d="M14.5 4.5c3-1 5-1 5-1s0 2-1 5l-6.5 6.5-4-4z"/><path d="M8 11 5 11.5 3.5 14.5 7.5 15"/><path d="M13 16l-.5 3-3 1.5L9 16.5"/><circle cx="15.5" cy="8.5" r="1.3"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.2"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.2"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.2"/>',
  'search-doc': '<path d="M13 20.5H6.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H14l4.5 4.5v3"/><circle cx="16" cy="16" r="3"/><path d="m18.2 18.2 2.3 2.3"/>',
  books: '<rect x="3.5" y="4" width="4.5" height="16" rx="1"/><rect x="9.5" y="4" width="4.5" height="16" rx="1"/><path d="m15.5 5.2 3.6-.9 2.4 15-3.6.9z"/>',
  summary: '<path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9z"/><path d="M14 3.5V9h5.5"/><path d="M8 13h8M8 16.5h5"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5z"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8.5 20.5h7"/><path d="m10 8 4 2-4 2z"/>',
  puzzle: '<path d="M10 4.5a2 2 0 0 1 4 0V6h4v4h-1.5a2 2 0 0 0 0 4H18v4.5h-4.5V17a2 2 0 0 0-4 0v1.5H5V14h1.5a2 2 0 0 0 0-4H5V6h5z"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2H10l2 2.5h6.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  pen: '<path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H11"/><path d="M14 3.5 19.5 9v2"/><path d="m15.5 20.5 5-5-2-2-5 5-.5 2.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>',
  swap: '<path d="M4 8h14"/><path d="m14.5 4.5 3.5 3.5-3.5 3.5"/><path d="M20 16H6"/><path d="m9.5 12.5-3.5 3.5 3.5 3.5"/>',
  'text-scan': '<path d="M4 8V5.5a1.5 1.5 0 0 1 1.5-1.5H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M8.5 8.5h7M12 8.5v7"/>',
  camera: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  bolt: '<path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z"/>',
  logout: '<path d="M14.5 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/><path d="M10 16.5 5.5 12 10 7.5"/><path d="M5.5 12h10"/>',
  drag: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  'arrow-up': '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="1.8"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 7 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
};

/**
 * Colore di ogni icona di navigazione: le vecchie emoji erano colorate e il
 * colore aiuta a riconoscere le voci a colpo d'occhio, soprattutto nella rail
 * collassata. Tinte a media saturazione, leggibili su tema chiaro e scuro.
 * Chi vuole l'icona colorata imposta `color` sul contenitore (vedi navIconColor);
 * altrove l'icona eredita il colore del testo (currentColor).
 */
export const NAV_ICON_COLORS: Record<string, string> = {
  home: '#3b82f6', user: '#3b82f6', users: '#8b5cf6', layers: '#8b5cf6', grid: '#6366f1',
  briefcase: '#d97706', timeline: '#06b6d4', sparkles: '#d97706', mail: '#ef4444', inbox: '#0ea5e9',
  send: '#ec4899', chat: '#14b8a6', article: '#10b981', star: '#f59e0b', shield: '#64748b',
  flask: '#8b5cf6', rocket: '#f97316', dashboard: '#6366f1', 'search-doc': '#3b82f6', books: '#d97706',
  summary: '#0d9488', globe: '#06b6d4', slides: '#f97316', puzzle: '#22c55e', folder: '#f59e0b',
  pen: '#ec4899', eye: '#0ea5e9', pencil: '#ca8a04', swap: '#22c55e', 'text-scan': '#6366f1',
  camera: '#f43f5e', palette: '#ec4899', logout: '#ef4444', sun: '#f59e0b', moon: '#818cf8', monitor: '#64748b',
};

/** Colore dell'icona, o null per lasciarle il colore del testo. */
export function navIconColor(name: string): string | null {
  return Object.prototype.hasOwnProperty.call(NAV_ICON_COLORS, name) ? NAV_ICON_COLORS[name] : null;
}

/** Icona di fallback se un nome non è (ancora) nella mappa: un punto, mai un riquadro vuoto. */
const FALLBACK = '<circle cx="12" cy="12" r="2.5"/>';

@Component({
  selector: 'app-nav-icon',
  standalone: true,
  template: `<span [innerHTML]="markup()"></span>`,
  styles: [`:host { display: inline-flex; line-height: 0; flex-shrink: 0; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavIconComponent {
  readonly name = input.required<string>();
  readonly size = input(18);

  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Il sanitizer HTML di Angular elimina gli elementi SVG (<path>, <circle>…):
   * con un [innerHTML] normale le icone restavano vuote. Il bypass è sicuro
   * perché il markup viene solo da NAV_ICONS, costante interna indicizzata
   * per nome: l'input `name` sceglie una chiave, non fornisce mai markup.
   * L'innerHTML è sullo span HTML, non sull'SVG: il DOM usato dal prerender
   * non implementa il setter innerHTML degli elementi SVG.
   */
  readonly markup = computed<SafeHtml>(() => {
    const name = this.name();
    const shapes = Object.prototype.hasOwnProperty.call(NAV_ICONS, name) ? NAV_ICONS[name] : FALLBACK;
    const size = this.size();
    const svg = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });
}
