import { Component, EventEmitter, Input, Output } from '@angular/core';
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
export class ConfirmDialogComponent {
  @Input() visible = false;
  @Input() titleKey = 'admin.confirm_delete_title';
  @Input() messageKey = '';
  @Input() messageParams: Record<string, unknown> = {};

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
