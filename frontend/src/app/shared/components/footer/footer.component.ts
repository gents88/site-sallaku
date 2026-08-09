import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LangUrlPipe } from '../../pipes/lang-url.pipe';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, LangUrlPipe],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
}
