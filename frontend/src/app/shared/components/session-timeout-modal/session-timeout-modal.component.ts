import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-session-timeout-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './session-timeout-modal.component.html',
  styleUrl: './session-timeout-modal.component.scss',
})
export class SessionTimeoutModalComponent {
  @Input({ required: true }) countdownSeconds = 30;
  @Output() stayLoggedIn = new EventEmitter<void>();
  @Output() logoutNow = new EventEmitter<void>();
}