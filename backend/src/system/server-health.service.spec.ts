import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { ServerHealthService, STALE_BACKUP_HOURS, parseMeminfo, successRate } from './server-health.service';

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('parseMeminfo', () => {
  it('usa MemAvailable, non MemFree', () => {
    const text = 'MemTotal:        1843200 kB\nMemFree:          102400 kB\nMemAvailable:     921600 kB\n';
    expect(parseMeminfo(text)).toEqual({ totalMb: 1800, availableMb: 900 });
  });

  it('restituisce null se mancano i campi', () => {
    expect(parseMeminfo('MemTotal: 10 kB')).toBeNull();
  });
});

describe('successRate', () => {
  it('ignora i run ancora in corso', () => {
    expect(successRate([{ conclusion: 'success' }, { conclusion: 'failure' }, { conclusion: null }, { conclusion: 'success' }])).toBe(66.7);
    expect(successRate([{ conclusion: null }])).toBeNull();
  });
});

describe('ServerHealthService.backups', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'backups-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const NOW = new Date('2026-10-17T12:00:00Z');
  const touch = (name: string, at: Date, bytes = 10) => {
    writeFileSync(join(dir, name), Buffer.alloc(bytes));
    utimesSync(join(dir, name), at, at);
  };

  it('trova l’ultimo dump, la sua età e ignora i file che non sono dump completi', async () => {
    touch('mongo-backup-20261016-033000.archive.gz', new Date('2026-10-16T03:30:00Z'), 100);
    touch('mongo-backup-20261017-033000.archive.gz', new Date('2026-10-17T03:30:00Z'), 200);
    touch('mongo-backup-20261017-040000.archive.gz.part', new Date('2026-10-17T04:00:00Z'));
    touch('note.txt', new Date('2026-10-17T05:00:00Z'));

    const b = await new ServerHealthService(config({ BACKUP_DIR: dir })).backups(NOW);

    expect(b.configured).toBe(true);
    expect(b.count).toBe(2);
    expect(b.totalBytes).toBe(300);
    expect(b.latest).toEqual(expect.objectContaining({ file: 'mongo-backup-20261017-033000.archive.gz', sizeBytes: 200, ageHours: 8.5 }));
    expect(b.stale).toBe(false);
  });

  it('segnala un backup vecchio oltre la soglia', async () => {
    touch('mongo-backup-20261015-033000.archive.gz', new Date(NOW.getTime() - (STALE_BACKUP_HOURS + 1) * 3_600_000));
    const b = await new ServerHealthService(config({ BACKUP_DIR: dir })).backups(NOW);
    expect(b.stale).toBe(true);
  });

  it('cartella assente = non configurato, senza errori', async () => {
    const b = await new ServerHealthService(config({ BACKUP_DIR: join(dir, 'manca') })).backups(NOW);
    expect(b).toEqual(expect.objectContaining({ configured: false, latest: null, stale: false }));
  });
});

describe('ServerHealthService.github', () => {
  const original = global.fetch;
  afterEach(() => (global.fetch = original));

  function runsResponse(conclusions: Array<string | null>) {
    return {
      ok: true,
      json: async () => ({
        workflow_runs: conclusions.map((c, i) => ({ name: 'w', conclusion: c, status: c ? 'completed' : 'in_progress', updated_at: `2026-10-17T0${i}:00:00Z`, html_url: `u${i}` })),
      }),
    };
  }

  it('legge ultimo backup esterno e percentuale di uptime, e tiene la risposta in cache', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('mongo-backup.yml') ? runsResponse(['success']) : runsResponse(['success', 'failure', 'success', 'success']),
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new ServerHealthService(config({ GITHUB_REPO: 'me/repo' }));

    const g = await service.github(1_000);
    expect(fetchMock.mock.calls[0][0]).toContain('/repos/me/repo/actions/workflows/');
    expect(g.offsiteBackup?.conclusion).toBe('success');
    expect(g.uptime.successPct).toBe(75);
    expect(g.uptime.checks).toBe(4);

    await service.github(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('se GitHub non risponde non rompe nulla e riprova dopo poco, non a ogni giro', async () => {
    const fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new ServerHealthService(config({}));

    const g = await service.github(0);
    expect(g.configured).toBe(false);
    await service.github(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await service.github(3 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('ServerHealthService.snapshot', () => {
  it('raccoglie gli avvisi', async () => {
    const service = new ServerHealthService(config({}));
    jest.spyOn(service, 'backups').mockResolvedValue({ configured: true, dir: '/x', count: 1, totalBytes: 1, latest: null, stale: true });
    jest.spyOn(service, 'memory').mockResolvedValue({ totalMb: 1800, availableMb: 100, usedPct: 94, low: true });
    jest.spyOn(service, 'disk').mockResolvedValue(null);
    jest.spyOn(service, 'mongo').mockResolvedValue({ residentMb: null, connections: null, uptimeHours: null });
    jest.spyOn(service, 'github').mockResolvedValue({
      configured: true,
      offsiteBackup: { name: 'b', conclusion: 'failure', status: 'completed', at: '', url: '' },
      uptime: { last: { name: 'u', conclusion: 'success', status: 'completed', at: '', url: '' }, successPct: 100, checks: 1 },
    });

    const s = await service.snapshot();
    expect(s.warnings).toEqual(['backup_stale', 'memory_low', 'offsite_backup_failed']);
  });
});
