import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { LiveHandoffState } from '../../../core/services/live-handoff.service';

@Component({
  selector: 'app-live-handoff-prompt',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './live-handoff-prompt.component.html',
  styleUrl: './live-handoff-prompt.component.scss',
})
export class LiveHandoffPromptComponent {
  @Input({ required: true }) state: LiveHandoffState = 'idle';
  @Input() minimized = false;

  @Output() accept = new EventEmitter<void>();
  @Output() decline = new EventEmitter<void>();
  @Output() reopen = new EventEmitter<void>();

  get showBanner(): boolean {
    return this.state === 'prompt_shown' && !this.minimized;
  }

  get showPill(): boolean {
    return (this.state === 'prompt_shown' && this.minimized) || this.isWaiting;
  }

  get isWaiting(): boolean {
    return this.state === 'request_sent' || this.state === 'agent_joining';
  }

  onPillClick(): void {
    if (this.state === 'prompt_shown' && this.minimized) {
      this.reopen.emit();
    }
  }
}
