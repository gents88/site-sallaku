import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { ContentSectionComponent } from './content-section.component';
import { AdminDashboardService } from '../../admin-dashboard.service';

describe('ContentSectionComponent', () => {
  it('mostra traduzioni, programmati, link rotti e sicurezza (ultime 24 ore)', () => {
    TestBed.configureTestingModule({
      imports: [ContentSectionComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: AdminDashboardService, useValue: {} }],
    });
    const fixture = TestBed.createComponent(ContentSectionComponent);
    fixture.componentRef.setInput('translationHealth', { posts: 0, missing: 0, items: [] });
    fixture.componentRef.setInput('notFound', { open: 0, top: [] });
    fixture.componentRef.setInput('security', { failedLogins24h: 0, otpFailed24h: 0, tokenReuse: 0, activeSessions: 0, suspiciousIps: [], sessions: [], events: [] });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const titles = Array.from(el.querySelectorAll('app-dashboard-card h2')).map(h => h.textContent?.trim());
    expect(titles).toEqual(['translation_health.title', 'scheduled_posts.title', 'not_found.title', 'security_panel.title']);
    expect(el.textContent).toContain('dashboard_ux.period_24h');
  });
});
