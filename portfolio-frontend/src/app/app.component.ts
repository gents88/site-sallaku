import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NavbarComponent } from './shared/components/navbar/navbar.component';
import { FooterComponent } from './shared/components/footer/footer.component';
import { ThemeService } from './core/services/theme.service';
import { SeoService } from './core/services/seo.service';
import { LanguageService } from './core/services/language.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule, NavbarComponent, FooterComponent],
  template: `
    <a class="skip-link" href="#hero">{{ 'skip.link' | translate }}</a>
    <div class="wip-banner" role="status">{{ 'banner.wip' | translate }}</div>
    <app-navbar />
    <main>
      <router-outlet />
    </main>
    <app-footer />
  `,
  styles: [`
    .skip-link {
      position: absolute;
      left: 16px;
      top: -60px;
      z-index: 1201;
      padding: 12px 16px;
      border-radius: 999px;
      background: var(--primary-500, #4f6af5);
      color: #fff;
      font-weight: 700;
      transition: top 0.2s ease;
      text-decoration: none;
    }

    .skip-link:focus {
      top: 16px;
    }

    .wip-banner {
      position: fixed;
      top: 72px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(90deg, #ffd54a, #ffb84d);
      color: #000;
      padding: 6px 12px;
      border-radius: 999px;
      font-weight: 600;
      z-index: 1100;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
    }

    @media (max-width: 900px) {
      .wip-banner {
        top: 76px;
        max-width: calc(100vw - 32px);
        text-align: center;
      }
    }

    main { min-height: calc(100vh - 130px); }
  `],
})
export class AppComponent implements OnInit {
  constructor(
    private themeService: ThemeService,
    private seoService: SeoService,
    private langService: LanguageService, // initializes on construction
  ) {}

  ngOnInit(): void {
    this.themeService.init();
    this.seoService.trackPageViews();
    // Apply the html lang attribute on startup
    document.documentElement.lang = this.langService.current();
  }
}
