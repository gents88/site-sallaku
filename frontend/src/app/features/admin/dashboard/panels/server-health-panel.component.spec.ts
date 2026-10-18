import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { describe, expect, it } from 'vitest';
import { ServerHealthPanelComponent, formatBytes, runBadge } from './server-health-panel.component';
import { ServerHealth } from '../admin-dashboard.service';

const HEALTH: ServerHealth = {
  backups: {
    configured: true, dir: '/home/app/backups', count: 14, totalBytes: 140_000_000, stale: false,
    latest: { file: 'mongo-backup-20261017-033000.archive.gz', sizeBytes: 10_485_760, at: '2026-10-17T03:30:00Z', ageHours: 8.5 },
  },
  memory: { totalMb: 1800, availableMb: 640, usedPct: 64, low: false },
  disk: { path: '/home', totalGb: 80, freeGb: 54.2, usedPct: 32, low: false },
  mongo: { residentMb: 210, connections: 12, uptimeHours: 30 },
  load: [0.21, 0.3, 0.28],
  github: {
    configured: true,
    offsiteBackup: { name: 'Mongo backup', conclusion: 'success', status: 'completed', at: '2026-10-17T04:20:00Z', url: 'https://github.com/x' },
    uptime: { last: null, successPct: 99, checks: 100 },
  },
  warnings: [],
};

describe('formatBytes / runBadge', () => {
  it('formats sizes compactly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(10_485_760)).toBe('10 MB');
    expect(formatBytes(1_610_612_736)).toBe('1.5 GB');
  });

  it('maps a workflow conclusion to a badge', () => {
    expect(runBadge('success')).toBe('ok');
    expect(runBadge(null)).toBe('warn');
    expect(runBadge('failure')).toBe('bad');
  });
});

describe('ServerHealthPanelComponent', () => {
  function render(data: ServerHealth | null, failed = false) {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(ServerHealthPanelComponent);
    fixture.componentInstance.data = data;
    fixture.componentInstance.failed = failed;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows backup age, free RAM and the external checks when everything is fine', () => {
    const el = render(HEALTH);
    expect(el.textContent).toContain('server_health.all_ok');
    expect(el.textContent).toContain('8.5 h');
    expect(el.textContent).toContain('640 MB');
    expect(el.textContent).toContain('99%');
    expect(el.querySelector('.panel-badge--ok')).not.toBeNull();
  });

  it('lists the warnings, translated, instead of the all-ok line', () => {
    const el = render({ ...HEALTH, warnings: ['backup_stale', 'memory_low'], memory: { ...HEALTH.memory, low: true } });
    const items = el.querySelectorAll('[role="alert"] li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('server_health.warn_backup_stale');
    expect(el.textContent).not.toContain('server_health.all_ok');
  });

  it('explains a missing backup folder (dev machine) instead of showing an error', () => {
    const el = render({ ...HEALTH, backups: { ...HEALTH.backups, configured: false, latest: null, stale: false } });
    expect(el.textContent).toContain('server_health.backup_not_configured');
  });

  it('shows only an error when the section failed', () => {
    const el = render(null, true);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('admin.overview_partial_error');
  });
});
