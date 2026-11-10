import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';
import { LanguageService, withLangPrefix } from '../../../core/services/language.service';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { TAKE_SHARED_FILES, WAIT_LAUNCH_FILES } from '../../../core/utils/shared-files';

type OpenState = 'loading' | 'none';

/**
 * Destinazione di "Condividi con…" e "Apri con": prende il file ricevuto, lo
 * mette nel workspace e porta al Lab, dove il riquadro "Continua da dove eri
 * rimasto" propone gli strumenti adatti a quel tipo di file. Si vede solo se
 * non è arrivato nulla (pagina aperta a mano, condivisione fallita).
 */
@Component({
  selector: 'app-open-file',
  standalone: true,
  imports: [RouterLink, TranslateModule, LangUrlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="open-file">
      @if (state() === 'loading') {
        <p role="status">{{ 'open_file.receiving' | translate }}</p>
      } @else {
        <h1>{{ 'open_file.none_title' | translate }}</h1>
        <p>{{ 'open_file.none_hint' | translate }}</p>
        <a class="open-file__cta" [routerLink]="'/lab' | langUrl">{{ 'open_file.go_lab' | translate }}</a>
      }
    </main>
  `,
  styles: [`
    .open-file { max-width: 36rem; margin: 0 auto; padding: 5rem 1rem; text-align: center; color: var(--text-primary, #e6edf3); }
    .open-file h1 { font-size: 1.4rem; margin: 0 0 .75rem; }
    .open-file p { color: var(--text-secondary, #9aa4b2); line-height: 1.6; }
    .open-file__cta { display: inline-block; margin-top: 1rem; padding: .55rem 1.1rem; border-radius: 999px; color: #fff; background: var(--color-primary, #8b5cf6); text-decoration: none; }
  `],
})
export class OpenFileComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceService);
  private readonly lang = inject(LanguageService);
  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);
  private readonly takeShared = inject(TAKE_SHARED_FILES);
  private readonly waitLaunch = inject(WAIT_LAUNCH_FILES);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly state = signal<OpenState>('loading');

  async ngOnInit(): Promise<void> {
    this.seo.update({ title: this.translate.instant('open_file.none_title') as string, description: '', noindex: true });
    if (!this.isBrowser) return;

    // ?shared=N: ci manda il service worker dopo una condivisione. Senza, l'app è stata aperta con "Apri con".
    const files = this.route.snapshot.queryParamMap.has('shared')
      ? await this.takeShared().catch(() => [])
      : await this.waitLaunch().catch(() => []);

    const file = files[0];
    if (!file) {
      this.state.set('none');
      return;
    }
    this.workspace.send({ kind: 'file', blob: file, filename: file.name, mime: file.type, fromTool: 'open-file' });
    await this.router.navigateByUrl(withLangPrefix('/lab', this.lang.current()), { replaceUrl: true });
  }
}
