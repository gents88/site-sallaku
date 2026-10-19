import { Directive, ElementRef, HostListener, inject } from '@angular/core';

const CONTROLS = 'input, textarea, select';

/**
 * Sul submit di un form non valido porta il focus sul primo campo errato.
 *
 * Con `novalidate` il browser non lo fa da solo: chi usa tastiera o screen
 * reader premeva "Invia", non succedeva nulla di annunciato e doveva cercare a
 * mano quale campo mancava (WCAG 3.3.1 / 3.3.3). Usa le classi `ng-invalid` che
 * Angular mette sui controlli, quindi funziona sia con i form reattivi sia con
 * ngModel; salta i campi nascosti (honeypot) e quelli disabilitati.
 *
 * Il focus avviene in un microtask: l'handler `ngSubmit` del form (che marca i
 * campi come "touched" e mostra i messaggi) è già stato eseguito.
 */
@Directive({
  selector: 'form[appFocusFirstInvalid]',
  standalone: true,
})
export class FocusFirstInvalidDirective {
  private readonly host = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;

  @HostListener('submit')
  onSubmit(): void {
    queueMicrotask(() => this.focusFirstInvalid());
  }

  private focusFirstInvalid(): void {
    const target = Array.from(this.host.querySelectorAll<HTMLElement>(`${CONTROLS}`)).find(el =>
      el.classList.contains('ng-invalid')
      && !(el as HTMLInputElement).disabled
      && el.getAttribute('aria-hidden') !== 'true'
      && el.tabIndex !== -1
      && el.closest('[aria-hidden="true"], .hidden, [hidden]') === null,
    );
    target?.focus();
  }
}
