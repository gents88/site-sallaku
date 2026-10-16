import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AiAssistantComponent } from './ai-assistant.component';
import { ChatbotService, ChatMessage } from '../../../core/services/chatbot.service';
import { AuthService } from '../../../core/services/auth.service';

describe('AiAssistantComponent avatar utente', () => {
  function setup(admin: boolean) {
    const messages = new BehaviorSubject<ChatMessage[]>([{ role: 'user', content: 'Ciao', timestamp: new Date(1) }]);
    TestBed.configureTestingModule({
      imports: [AiAssistantComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ChatbotService, useValue: { messages$: messages, isLoading$: new BehaviorSubject(false), sendMessage: vi.fn(), clearHistory: vi.fn() } },
        { provide: AuthService, useValue: { isLoggedIn: signal(true), isAdmin: signal(admin) } },
      ],
    });
    const fixture = TestBed.createComponent(AiAssistantComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('.user-avatar');
  }

  it("da admin mostra la foto profilo accanto ai propri messaggi", () => {
    const avatar = setup(true);
    expect(avatar?.querySelector('app-profile-photo img')).not.toBeNull();
    expect(avatar?.textContent?.trim()).toBe('');
  });

  it('per gli altri utenti resta la "U"', () => {
    const avatar = setup(false);
    expect(avatar?.querySelector('app-profile-photo')).toBeNull();
    expect(avatar?.textContent?.trim()).toBe('U');
  });
});
