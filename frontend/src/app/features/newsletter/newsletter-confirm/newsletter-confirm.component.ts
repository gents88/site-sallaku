import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { NewsletterService } from '../../../core/services/newsletter.service';
import { LangUrlPipe } from '../../../shared/pipes/lang-url.pipe';

type ConfirmState = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-newsletter-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, MatIconModule, TranslateModule, LangUrlPipe],
  templateUrl: './newsletter-confirm.component.html',
  styleUrl: './newsletter-confirm.component.scss',
})
export class NewsletterConfirmComponent implements OnInit {
  state: ConfirmState = 'loading';

  constructor(
    private route: ActivatedRoute,
    private newsletterService: NewsletterService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state = 'error';
      return;
    }

    this.newsletterService.confirm(token).subscribe({
      next: () => { this.state = 'success'; this.cdr.markForCheck(); },
      error: () => { this.state = 'error'; this.cdr.markForCheck(); },
    });
  }
}
