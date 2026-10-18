import { ChangeDetectionStrategy, Component, ElementRef, HostListener, OnInit, PLATFORM_ID, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ConsentService } from '../../../core/services/consent.service';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

type Category = 'analytics' | 'marketing' | 'preferences';
type Choices = Record<Category, boolean>;

@Component({
  selector: 'app-consent-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [TranslateModule, RouterLink, LangUrlPipe],
  templateUrl: './consent-banner.component.html',
  styleUrl: './consent-banner.component.scss',
})
export class ConsentBannerComponent implements OnInit {
  readonly categories: readonly Category[] = ['analytics', 'marketing', 'preferences'];

  visible = signal(false);
  modalVisible = signal(false);
  choices: Choices = { analytics: false, marketing: false, preferences: false };

  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly modalBoxRef = viewChild<ElementRef<HTMLElement>>('modalBox');
  /** Elemento che aveva il focus prima dell'apertura: lo si restituisce alla chiusura. */
  private returnFocusTo: HTMLElement | null = null;
  private previousBodyOverflow = '';

  constructor(private consent: ConsentService) {
    effect(() => {
      const box = this.modalBoxRef();
      if (box) setTimeout(() => box.nativeElement.querySelector<HTMLElement>('[data-first]')?.focus(), 0);
    });

    // reopenRequested starts at 0 and this only fires on increments (footer's
    // "manage cookie consent" link), so it never opens the modal on load —
    // ngOnInit's `visible` already handles the first-visit banner.
    // untracked: openPreferences() legge consent.state() per precompilare gli
    // interruttori. Senza untracked l'effect dipendeva anche da state(), quindi
    // "Salva preferenze" (che cambia lo state) lo rieseguiva con
    // reopenRequested ancora > 0 e la modale si riapriva subito: sembrava
    // impossibile da chiudere.
    effect(() => {
      if (this.consent.reopenRequested() > 0) untracked(() => this.openPreferences());
    });

    // While shown, this fixed banner sits directly over whatever content is
    // at the true bottom of a short page (e.g. the footer's legal links).
    // Mirrors data-sidebar/data-theme: an attribute on <html> that other
    // components' SCSS can key off via :host-context (footer reserves extra
    // bottom padding, the chat FAB hides on mobile, only while this is set).
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      this.document.documentElement.toggleAttribute('data-cookie-banner-open', this.visible());
    });

    // Blocca lo scroll della pagina sotto la modale: su mobile, senza, il
    // gesto di scroll dentro il bottom sheet faceva scorrere la pagina dietro.
    // Agisce solo sulle transizioni: al primo giro (modale chiusa) non deve
    // toccare un overflow impostato da altri (es. il drawer della sidebar).
    let locked = false;
    effect(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      const open = this.modalVisible();
      if (open === locked) return;
      locked = open;
      const body = this.document.body;
      if (open) {
        this.previousBodyOverflow = body.style.overflow;
        body.style.overflow = 'hidden';
      } else {
        body.style.overflow = this.previousBodyOverflow;
      }
    });
  }

  ngOnInit(): void {
    // ConsentService re-applies a stored choice to gtag at construction time —
    // this only decides whether the banner itself needs to be shown.
    this.visible.set(!this.consent.hasDecided());
  }

  acceptAll(): void { this.save({ analytics: true, marketing: true, preferences: true }); }
  rejectAll(): void { this.save({ analytics: false, marketing: false, preferences: false }); }
  savePreferences(): void { this.save({ ...this.choices }); }

  openPreferences(): void {
    // Prefill from the current stored choice (if any) rather than always
    // false, so reopening to "manage" preferences shows what's actually
    // active instead of looking like everything was rejected.
    const state = this.consent.state();
    this.choices = {
      analytics: state?.analytics ?? false,
      marketing: state?.marketing ?? false,
      preferences: state?.preferences ?? false,
    };
    if (!this.modalVisible()) {
      const active = this.document.activeElement;
      this.returnFocusTo = active instanceof HTMLElement ? active : null;
    }
    this.modalVisible.set(true);
  }

  closeModal(): void {
    if (!this.modalVisible()) return;
    this.modalVisible.set(false);
    const target = this.returnFocusTo;
    this.returnFocusTo = null;
    if (target?.isConnected) setTimeout(() => target.focus(), 0);
  }

  toggle(cat: Category, event: Event): void {
    this.choices = { ...this.choices, [cat]: (event.target as HTMLInputElement).checked };
  }

  /** Tap sullo sfondo scuro (fuori dal riquadro) = chiudi, come ogni bottom sheet. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeModal();
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    this.closeModal();
  }

  /** Focus trap manuale: Tab/Shift+Tab restano dentro finché la modale preferenze è aperta. */
  onModalTabKey(event: Event): void {
    const ke = event as KeyboardEvent;
    const box = ke.currentTarget as HTMLElement;
    const focusable = Array.from(
      box.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ke.shiftKey && this.document.activeElement === first) {
      ke.preventDefault();
      last.focus();
    } else if (!ke.shiftKey && this.document.activeElement === last) {
      ke.preventDefault();
      first.focus();
    }
  }

  private save(partial: Choices): void {
    this.consent.setConsent(partial);
    this.visible.set(false);
    this.closeModal();
  }
}
