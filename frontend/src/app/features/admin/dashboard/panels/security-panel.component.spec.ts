import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityPanelComponent } from './security-panel.component';
import { AdminDashboardService, SecuritySummary } from '../admin-dashboard.service';
import { AuthService } from '../../../../core/services/auth.service';

const DATA: SecuritySummary = {
  failedLogins24h: 7,
  otpFailed24h: 2,
  tokenReuse7d: 1,
  activeSessions: 2,
  suspiciousIps: [{ ip: '198.51.100.9', failures: 6 }],
  sessions: [
    { userId: 'me', name: 'Gent', contact: 'g@x.it', role: 'admin', device: 'Chrome su macOS', ip: '203.0.113.7', startedAt: '2026-10-22T08:00:00Z', lastSeenAt: '2026-10-22T11:00:00Z' },
    { userId: 'u2', name: 'Anna', contact: 'a@x.it', role: 'user', device: 'Safari su iOS', ip: '203.0.113.8', startedAt: '2026-10-22T09:00:00Z', lastSeenAt: '2026-10-22T10:00:00Z' },
  ],
  events: [
    { _id: 'e1', type: 'login_failed', ip: '198.51.100.9', device: 'curl', identifier: 'admin@x.it', detail: 'password errata', createdAt: '2026-10-22T10:30:00Z' },
    { _id: 'e2', type: 'refresh_reuse', ip: '203.0.113.8', device: 'Safari su iOS', identifier: 'a@x.it', detail: 'token già ruotato', createdAt: '2026-10-22T10:00:00Z' },
  ],
};

describe('SecurityPanelComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(data: SecuritySummary = DATA, revoke = vi.fn(() => of(undefined))) {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: AdminDashboardService, useValue: { revokeSession: revoke } },
        { provide: AuthService, useValue: { currentUser: signal({ _id: 'me', name: 'Gent', role: 'admin' }) } },
      ],
    });
    const fixture = TestBed.createComponent(SecurityPanelComponent);
    fixture.componentInstance.data = data;
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const closeButtons = () => Array.from(el.querySelectorAll('button')).filter(b => b.textContent?.includes('security_panel.close_session'));
    return { fixture, el, revoke, changed, closeButtons };
  }

  it('mostra contatori, IP sospetti, sessioni ed eventi', () => {
    const { el } = setup();
    const text = el.textContent ?? '';
    expect(text).toContain('7');
    expect(text).toContain('198.51.100.9');
    expect(text).toContain('×6');
    expect(text).toContain('Chrome su macOS');
    expect(text).toContain('203.0.113.8');
    expect(text).toContain('security_panel.ev_login_failed');
    expect(text).toContain('admin@x.it');
  });

  it('il riuso di un token è evidenziato come grave', () => {
    const { el } = setup();
    expect(el.querySelectorAll('.panel-badge--bad').length).toBeGreaterThanOrEqual(2); // IP sospetto + evento
    expect(el.querySelector('.panel-kpi--bad')).not.toBeNull();
  });

  it('la propria sessione è marcata "Tu" e non ha il pulsante di chiusura', () => {
    const { el, closeButtons } = setup();
    expect(el.textContent).toContain('security_panel.you');
    expect(closeButtons()).toHaveLength(1);
  });

  it('chiudere la sessione chiede conferma e poi fa ricaricare la dashboard', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { revoke, changed, closeButtons } = setup();
    closeButtons()[0].click();
    expect(revoke).not.toHaveBeenCalled();
    closeButtons()[0].click();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('u2');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('se la chiusura fallisce mostra l’errore e non ricarica', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, el, changed, closeButtons } = setup(DATA, vi.fn(() => throwError(() => new Error('500'))));
    closeButtons()[0].click();
    fixture.detectChanges();
    expect(changed).not.toHaveBeenCalled();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('security_panel.close_error');
  });

  it('senza dati dice che non c’è nulla, senza IP sospetti non mostra la riga', () => {
    const { el } = setup({ failedLogins24h: 0, otpFailed24h: 0, tokenReuse7d: 0, activeSessions: 0, suspiciousIps: [], sessions: [], events: [] });
    expect(el.textContent).toContain('security_panel.no_sessions');
    expect(el.textContent).toContain('security_panel.no_events');
    expect(el.querySelector('.sec-ips')).toBeNull();
    expect(el.querySelector('.panel-kpi--ok')).not.toBeNull();
  });

  it('se la sezione è fallita mostra l’errore invece di zeri finti', () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: AdminDashboardService, useValue: {} },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
      ],
    });
    const fixture = TestBed.createComponent(SecurityPanelComponent);
    fixture.componentInstance.data = DATA;
    fixture.componentInstance.failed = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.panel-kpis')).toBeNull();
  });
});
