import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { ScheduledPostsPanelComponent } from './scheduled-posts-panel.component';
import { ScheduledPost } from '../admin-dashboard.service';

describe('ScheduledPostsPanelComponent', () => {
  function render(posts: ScheduledPost[]) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()], providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ScheduledPostsPanelComponent);
    fixture.componentInstance.posts = posts;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists upcoming posts with a link to the editor and the newsletter badge', () => {
    const el = render([
      { _id: 'p1', title: 'Esce lunedì', slug: 'esce', scheduledAt: '2026-10-19T07:00:00.000Z', notifySubscribers: true },
      { _id: 'p2', title: 'Esce martedì', slug: 'esce-2', scheduledAt: '2026-10-20T07:00:00.000Z', notifySubscribers: false },
    ]);
    const links = el.querySelectorAll('a.sp-title');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/dashboard/blog?edit=p1');
    expect(el.querySelectorAll('.panel-badge--ok')).toHaveLength(1);
  });

  it('shows an empty state with a shortcut to a new post', () => {
    const el = render([]);
    expect(el.textContent).toContain('scheduled_posts.none');
    expect(el.querySelector('.panel-actions a')?.getAttribute('href')).toBe('/dashboard/blog?new=1');
  });
});
