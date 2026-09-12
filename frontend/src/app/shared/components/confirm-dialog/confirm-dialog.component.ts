import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Generic confirm/cancel modal, extracted out of the admin dashboard
 * (which drove it from a `confirmDialog` state object shared by the
 * delete-contact and reset-monthly-stats actions). The parent still owns
 * the "what happens on confirm" logic — this component is presentation
 * only, mirroring the previous inline template 1:1.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIconModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
})
export class ConfirmDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() titleKey = 'admin.confirm_delete_title';
  @Input() messageKey = '';
  @Input() messageParams: Record<string, unknown> = {};

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('cancelBtn') private cancelBtnRef?: ElementRef<HTMLButtonElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      // Il pulsante "Annulla" esiste solo dopo che l'@if lo renderizza; e come
      // default va meglio dell'azione distruttiva se l'utente preme subito Invio.
      setTimeout(() => this.cancelBtnRef?.nativeElement.focus(), 0);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.visible) this.cancelled.emit();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro finché il dialog è visibile. */
  onDialogTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const dialog = ke.currentTarget as HTMLElement;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }
}
