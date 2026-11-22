import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ChatSessionsSectionComponent, sessionPreview } from './chat-sessions-section.component';
import { AdminDashboardService, ChatbotSession } from '../../admin-dashboard.service';

const SESSION = {
  sessionId: 's1', lastActivity: '2026-11-22T10:00:00Z', messageCount: 2,
  messages: [
    { role: 'user', content: 'Ciao, fai siti in Angular?', timestamp: '2026-11-22T10:00:00Z' },
    { role: 'assistant', content: 'Sì!', timestamp: '2026-11-22T10:00:05Z' },
  ],
} as unknown as ChatbotSession;

describe('ChatSessionsSectionComponent', () => {
  it('carica le chat a richiesta e apre la conversazione', () => {
    const getTodaySessions = vi.fn(() => of({ data: [SESSION], total: 1, page: 1, totalPages: 1 }));
    TestBed.configureTestingModule({
      imports: [ChatSessionsSectionComponent, TranslateModule.forRoot()],
      providers: [{ provide: AdminDashboardService, useValue: { getTodaySessions } }],
    });
    const fixture = TestBed.createComponent(ChatSessionsSectionComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(getTodaySessions).not.toHaveBeenCalled();
    expect(el.textContent).toContain('admin.chat_sessions_empty');

    (el.querySelector('.chat-load-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(getTodaySessions).toHaveBeenCalledWith(1);
    expect(el.textContent).toContain('Ciao, fai siti in Angular?');

    (el.querySelector('.chat-session-header') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.chat-bubble').length).toBe(2);
  });

  it('l\'anteprima taglia la prima domanda a 60 caratteri', () => {
    const long = { ...SESSION, messages: [{ role: 'user', content: 'x'.repeat(80), timestamp: '' }] } as unknown as ChatbotSession;
    expect(sessionPreview(long)).toBe('x'.repeat(60) + '…');
    expect(sessionPreview({ ...SESSION, messages: [] } as unknown as ChatbotSession)).toBe('—');
  });
});
