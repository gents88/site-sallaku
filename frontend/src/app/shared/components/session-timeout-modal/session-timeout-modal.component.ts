import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-session-timeout-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './session-timeout-modal.component.html',
  styleUrl: './session-timeout-modal.component.scss',
})
export class SessionTimeoutModalComponent implements AfterViewInit {
  @Input({ required: true }) countdownSeconds = 30;
  @Output() stayLoggedIn = new EventEmitter<void>();
  @Output() logoutNow = new EventEmitter<void>();

  @ViewChild('stayBtn') private stayBtnRef?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    // Il parent monta questo componente solo quando il warning va mostrato,
    // quindi ogni istanza è "appena aperta" — focus sull'azione sicura
    // (resta connesso), non su quella distruttiva.
    setTimeout(() => this.stayBtnRef?.nativeElement.focus(), 0);
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.stayLoggedIn.emit();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro finché il pannello è visibile. */
  onPanelTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const panel = ke.currentTarget as HTMLElement;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled])'));
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