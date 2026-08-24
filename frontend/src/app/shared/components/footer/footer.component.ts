import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';
import { ConsentService } from '../../../core/services/consent.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, LangUrlPipe, TranslateModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  readonly year = new Date().getFullYear();

  constructor(private consent: ConsentService) {}

  manageCookies(): void {
    this.consent.openPreferences();
  }
}
