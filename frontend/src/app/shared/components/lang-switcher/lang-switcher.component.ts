import { Component, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LanguageService, Lang, SUPPORTED_LANGS } from '../../../core/services/language.service';

@Component({
  selector: 'app-lang-switcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="lang-switcher" [class.open]="open()">
      <button class="lang-current" (click)="toggle()" [attr.aria-label]="'Change language'">
        <span class="lang-flag">{{ lang.currentMeta.flag }}</span>
        <span class="lang-code">{{ lang.current() | uppercase }}</span>
        <i class="fas fa-chevron-down lang-arrow" aria-hidden="true"></i>
      </button>
      <div class="lang-dropdown" role="menu">
        @for (opt of lang.supported; track opt.code) {
          <button
            class="lang-option"
            [class.active]="lang.current() === opt.code"
            (click)="select(opt.code)"
            role="menuitem"
          >
            <span class="lang-flag">{{ opt.flag }}</span>
            <span>{{ opt.label }}</span>
            @if (lang.current() === opt.code) {
              <span class="lang-check">✓</span>
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .lang-switcher { position: relative; }

    .lang-current {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px;
      background: rgba(79,106,245,0.08);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      font-family: var(--font-main);
      font-size: 0.8rem;
      color: var(--text-secondary);
      transition: var(--transition-base, 0.2s ease);
      &:hover { border-color: rgba(99,102,241,0.4); color: var(--text-primary); }
    }

    .lang-code { font-weight: 600; font-size: 0.75rem; letter-spacing: 0.05em; }

    .lang-arrow {
      font-size: 0.55rem;
      transition: transform 0.2s ease;
    }

    .lang-switcher.open .lang-arrow { transform: rotate(180deg); }

    .lang-dropdown {
      position: absolute; top: calc(100% + 8px); right: 0;
      min-width: 150px;
      background: var(--bg-tertiary, #141a2e);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md, 10px);
      padding: 6px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      opacity: 0; visibility: hidden; transform: translateY(-8px);
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s ease;
      z-index: 1200;
      backdrop-filter: blur(20px);
    }

    .lang-switcher.open .lang-dropdown {
      opacity: 1; visibility: visible; transform: translateY(0);
    }

    .lang-option {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 9px 12px;
      background: none; border: none; border-radius: var(--radius-sm, 6px);
      cursor: pointer;
      font-family: var(--font-main); font-size: 0.85rem;
      color: var(--text-secondary);
      transition: background 0.15s ease, color 0.15s ease;
      text-align: left;
      &:hover { background: rgba(79,106,245,0.1); color: var(--text-primary); }
      &.active { background: rgba(79,106,245,0.15); color: var(--primary-400, #818cf8); font-weight: 600; }
    }

    .lang-flag { font-size: 1.1rem; }
    .lang-check { margin-left: auto; font-size: 0.7rem; color: var(--primary-400, #818cf8); }
  `],
})
export class LangSwitcherComponent {
  private readonly _open = signal(false);
  readonly open = this._open.asReadonly();

  constructor(public lang: LanguageService) {}

  toggle(): void { this._open.update(v => !v); }

  select(code: Lang): void {
    this.lang.setLang(code);
    this._open.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!(e.target as HTMLElement).closest('.lang-switcher')) {
      this._open.set(false);
    }
  }
}
