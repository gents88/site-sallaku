import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { ConsentService } from '../../../core/services/consent.service';
import { OnboardingTourService } from '../../../core/onboarding/onboarding-tour.service';
import { isToolAreaPath } from '../../../core/services/drawer.service';
import { LanguageService, stripLangPrefix, withLangPrefix } from '../../../core/services/language.service';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink, LangUrlPipe, TranslateModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  readonly year = new Date().getFullYear();

  constructor(
    private consent: ConsentService,
    private tour: OnboardingTourService,
    private router: Router,
    private lang: LanguageService,
  ) {}

  manageCookies(): void {
    this.consent.openPreferences();
  }

  /**
   * Riapre il tour guidato a richiesta, anche se già visto. Il tour spiega la
   * sidebar, che c'è solo nel Lab e nella dashboard: dalle altre pagine si
   * passa prima da /lab.
   */
  async startGuide(): Promise<void> {
    const path = stripLangPrefix(this.router.url.split(/[?#]/)[0]).basePath;
    if (!isToolAreaPath(path)) {
      const ok = await this.router.navigateByUrl(withLangPrefix('/lab', this.lang.current()));
      if (!ok) return;
    }
    await this.tour.start();
  }
}
