import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { ConsentService } from '../../../core/services/consent.service';
import { OnboardingTourService } from '../../../core/onboarding/onboarding-tour.service';

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
  ) {}

  manageCookies(): void {
    this.consent.openPreferences();
  }

  /** Riapre il tour guidato a richiesta, anche se già visto. */
  startGuide(): void {
    void this.tour.start();
  }
}
