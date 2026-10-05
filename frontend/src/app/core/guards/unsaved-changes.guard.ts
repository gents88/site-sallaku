import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';

/** Implementato dalle pagine admin con form: true se c'è qualcosa che andrebbe perso uscendo. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Prima nessuna pagina admin avvisava: un click sulla sidebar a metà di un
 * progetto o della pagina "Chi sono" buttava via tutto in silenzio.
 * Copre la navigazione interna; il refresh/chiusura della scheda lo copre
 * `warnOnUnload` (beforeunload) nei singoli componenti.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges?.()) return true;
  return confirm(inject(TranslateService).instant('common.unsaved_confirm'));
};

/** Per @HostListener('window:beforeunload'): fa comparire il prompt nativo del browser se ci sono modifiche. */
export function warnOnUnload(event: BeforeUnloadEvent, dirty: boolean): void {
  if (!dirty) return;
  event.preventDefault();
  // Richiesto da alcuni browser più vecchi per mostrare il prompt.
  event.returnValue = '';
}
