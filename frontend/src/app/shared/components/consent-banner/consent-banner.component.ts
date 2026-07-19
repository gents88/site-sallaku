import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { ConsentService } from '../../../core/services/consent.service';

@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule],
  template: `
    <div *ngIf="visible()" class="consent-banner" role="dialog" aria-live="polite">
      <div class="consent-banner__text">
        <strong>{{ 'consent.title' | translate }}</strong>
        <div class="consent-banner__desc">{{ 'consent.desc' | translate }}</div>
      </div>
      <div class="consent-banner__actions">
        <button class="btn btn-ghost" (click)="openPreferences()">{{ 'consent.manage_preferences' | translate }}</button>
        <button class="btn btn-secondary" (click)="rejectAll()">{{ 'consent.reject_all' | translate }}</button>
        <button class="btn btn-primary" (click)="acceptAll()">{{ 'consent.accept_all' | translate }}</button>
      </div>
    </div>

    <div *ngIf="modalVisible()" class="consent-modal" role="dialog" aria-modal="true">
      <div class="consent-modal__box">
        <h3>{{ 'consent.settings_title' | translate }}</h3>
        <p class="text-muted">{{ 'consent.settings_desc' | translate }}</p>
        <div class="pref-row"><label>{{ 'consent.necessary' | translate }}</label><input type="checkbox" [checked]="true" disabled/></div>
        <div class="pref-row"><label>{{ 'consent.analytics' | translate }}</label><input type="checkbox" [(ngModel)]="analytics"/></div>
        <div class="pref-row"><label>{{ 'consent.marketing' | translate }}</label><input type="checkbox" [(ngModel)]="marketing"/></div>
        <div class="pref-row"><label>{{ 'consent.preferences' | translate }}</label><input type="checkbox" [(ngModel)]="preferences"/></div>
        <div class="consent-modal__actions">
          <button class="btn btn-ghost" (click)="closeModal()">{{ 'common.close' | translate }}</button>
          <button class="btn btn-primary" (click)="savePreferences()">{{ 'consent.save' | translate }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .consent-banner { position:fixed; left:12px; right:12px; bottom:12px; background:var(--panel-surface,#081223); color:#fff; padding:14px; border-radius:12px; display:flex; gap:12px; align-items:center; z-index:99999; }
    .consent-banner__text { flex:1 1 480px }
    .consent-banner__actions { display:flex; gap:8px }
    .consent-modal { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); z-index:100000 }
    .consent-modal__box { background:#fff; color:#111; padding:18px; border-radius:8px; width:100%; max-width:640px }
    .pref-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #eee }
    .consent-modal__actions { display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
    .btn { padding:8px 12px; border-radius:8px; cursor:pointer }
    .btn-primary { background:linear-gradient(135deg,#4f6af5,#06b6d4); color:#fff; border:0 }
    .btn-secondary { background:#111827; color:#fff; border:0 }
    .btn-ghost { background:transparent; border:1px solid rgba(0,0,0,0.06) }
  `],
})
export class ConsentBannerComponent implements OnInit {
  visible = signal(false);
  modalVisible = signal(false);
  analytics = false;
  marketing = false;
  preferences = false;

  constructor(private consent: ConsentService) {}

  ngOnInit(): void {
    // ConsentService re-applies a stored choice to gtag at construction time —
    // this only decides whether the banner itself needs to be shown.
    this.visible.set(!this.consent.hasDecided());
  }

  acceptAll(): void { this.save({ analytics: true, marketing: true, preferences: true }); }
  rejectAll(): void { this.save({ analytics: false, marketing: false, preferences: false }); }
  openPreferences(): void { this.analytics = false; this.marketing = false; this.preferences = false; this.modalVisible.set(true); }
  closeModal(): void { this.modalVisible.set(false); }

  savePreferences(): void { this.save({ analytics: this.analytics, marketing: this.marketing, preferences: this.preferences }); this.closeModal(); }

  private save(partial: { analytics: boolean; marketing: boolean; preferences: boolean }): void {
    this.consent.setConsent(partial);
    this.visible.set(false);
  }
}
