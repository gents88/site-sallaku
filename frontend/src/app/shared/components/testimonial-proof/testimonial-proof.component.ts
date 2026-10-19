import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { isSafeLinkedinProfileUrl } from '../../utils/linkedin-url';

/**
 * Prova di autenticità di una testimonianza: badge "Verificata" e link al
 * profilo LinkedIn dell'autore. Sono dati reali: il badge compare solo se
 * l'admin ha controllato l'identità (`verified`), e il link solo in quel caso
 * (il backend non manda nemmeno l'URL per le testimonianze non verificate).
 */
@Component({
  selector: 'app-testimonial-proof',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (verified()) {
      <span class="tp">
        <span class="tp__badge" [attr.title]="'testimonials.verified_tooltip' | translate">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>
          </svg>
          {{ 'testimonials.verified_badge' | translate }}
        </span>
        @if (safeLinkedin(); as href) {
          <a class="tp__link" [href]="href" target="_blank" rel="nofollow ugc noopener noreferrer"
             [attr.aria-label]="'testimonials.view_linkedin' | translate: { name: name() }">
            <i class="fab fa-linkedin-in" aria-hidden="true"></i> LinkedIn
          </a>
        }
      </span>
    }
  `,
  styles: [`
    .tp { display: inline-flex; flex-wrap: wrap; align-items: center; gap: .4rem .6rem; margin-top: .25rem; }
    .tp__badge {
      display: inline-flex; align-items: center; gap: .3rem; padding: .15rem .55rem; border-radius: 999px;
      font-size: .72rem; font-weight: 700; letter-spacing: .02em;
      color: var(--color-success-text, #047857); background: rgba(16, 185, 129, .14); border: 1px solid rgba(16, 185, 129, .45);
    }
    :host-context([data-theme="dark"]) .tp__badge { color: #6ee7b7; }
    .tp__link {
      display: inline-flex; align-items: center; gap: .3rem; font-size: .78rem; font-weight: 600;
      color: var(--primary-400, #6b8afc); text-decoration: none;
      &:hover { text-decoration: underline; }
      &:focus-visible { outline: 2px solid var(--primary-500, #4f6af5); outline-offset: 2px; border-radius: 4px; }
    }
  `],
})
export class TestimonialProofComponent {
  readonly verified = input<boolean | undefined>(false);
  readonly linkedinUrl = input<string | undefined>(undefined);
  readonly name = input<string>('');

  /** Il link si mostra solo se l'autore è verificato e l'URL è un profilo LinkedIn già normalizzato. */
  readonly safeLinkedin = computed(() => {
    const url = this.linkedinUrl();
    return this.verified() && isSafeLinkedinProfileUrl(url) ? url : null;
  });
}
