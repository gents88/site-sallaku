import { Directive, ElementRef, HostListener, Input, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const ATTR = 'data-vt-name';

/**
 * Dà `view-transition-name` a `el`, togliendolo prima a qualsiasi altro
 * elemento che lo aveva: due elementi con lo stesso nome nello stesso
 * snapshot fanno saltare l'intera transizione (InvalidStateError).
 */
export function claimViewTransitionName(el: HTMLElement, name: string): void {
  el.ownerDocument.querySelectorAll<HTMLElement>(`[${ATTR}="${name}"]`).forEach(other => {
    if (other === el) return;
    other.style.removeProperty('view-transition-name');
    other.removeAttribute(ATTR);
  });
  el.style.setProperty('view-transition-name', name);
  el.setAttribute(ATTR, name);
}

/**
 * Destinazione di una transizione "a elemento condiviso": l'elemento (es.
 * il titolo della pagina di dettaglio) prende il nome appena renderizzato.
 * Usato con [appVtNameOnClick] sulla card di partenza, il browser anima il
 * titolo della card fino alla sua nuova posizione invece di una dissolvenza.
 */
@Directive({ selector: '[appVtName]', standalone: true })
export class ViewTransitionNameDirective implements OnInit {
  @Input({ required: true }) appVtName!: string;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit(): void {
    if (this.isBrowser) claimViewTransitionName(this.el.nativeElement, this.appVtName);
  }
}

/**
 * Sorgente: in una lista ci sono tante card, quindi il nome va dato solo a
 * quella cliccata (o attivata da tastiera), un attimo prima che il router
 * catturi lo snapshot della pagina vecchia. `vtTarget` sceglie l'elemento
 * interno alla card da animare (default: la card stessa).
 */
@Directive({ selector: '[appVtNameOnClick]', standalone: true })
export class ViewTransitionNameOnClickDirective {
  @Input({ required: true }) appVtNameOnClick!: string;
  @Input() vtTarget?: string;
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('click')
  onClick(): void {
    const host = this.el.nativeElement;
    const target = (this.vtTarget && host.querySelector<HTMLElement>(this.vtTarget)) || host;
    claimViewTransitionName(target, this.appVtNameOnClick);
  }
}
