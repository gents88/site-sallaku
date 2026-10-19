import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Intestazione unica delle pagine pubbliche (Blog, Progetti, Contatti,
 * Testimonianze, Lab, Chi sono). Prima ogni pagina aveva la sua: titolo
 * centrato o a sinistra, `<tag>` monospace, gradienti diversi — e quello del
 * Lab partiva da un quasi-bianco fisso, invisibile in tema chiaro. I colori
 * qui vengono solo dai token del tema.
 *
 * Testi già tradotti in ingresso (`[title]="'x' | translate"`), così il
 * componente non dipende da ngx-translate. Il contenuto proiettato finisce
 * sotto il sottotitolo (es. le statistiche del blog).
 */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  template: `
    <header class="page-header" [class.page-header--center]="align === 'center'">
      @if (eyebrow) {
        <span class="page-header__eyebrow"><span class="page-header__dot" aria-hidden="true"></span>{{ eyebrow }}</span>
      }
      <h1 class="page-header__title" [attr.id]="titleId || null">{{ title }}</h1>
      @if (lead) {
        <p class="page-header__lead">{{ lead }}</p>
      }
      <ng-content />
    </header>
  `,
  styles: [`
    :host { display: block; }

    .page-header {
      box-sizing: border-box;
      max-width: 760px;
      margin: 0 0 2rem;
    }

    .page-header--center {
      margin-left: auto;
      margin-right: auto;
      text-align: center;
    }

    .page-header__eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.3rem 0.8rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--primary-500) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--primary-500) 28%, transparent);
      color: var(--primary-400);
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    /* --primary-400 su sfondo chiaro non arriva a 4.5:1: stessa correzione
       di .section-tag in styles.scss. */
    :host-context(html[data-theme='light']) .page-header__eyebrow { color: var(--primary-700); }

    .page-header__dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .page-header__title {
      margin: 0.9rem 0 0.6rem;
      font-size: clamp(2.4rem, 6vw, 3.75rem);
      font-weight: 800;
      line-height: 1.05;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    .page-header__lead {
      margin: 0;
      font-size: clamp(1rem, 1.6vw, 1.15rem);
      line-height: 1.6;
      color: var(--text-secondary);
    }
  `],
})
export class PageHeaderComponent {
  @Input({ required: true }) title = '';
  @Input() eyebrow = '';
  @Input() lead = '';
  /** Per gli `aria-labelledby` delle sezioni che contengono l'intestazione. */
  @Input() titleId = '';
  @Input() align: 'start' | 'center' = 'start';
}
