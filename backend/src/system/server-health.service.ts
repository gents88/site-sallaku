import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { promises as fs } from 'fs';
import { homedir, loadavg, totalmem, freemem } from 'os';
import { join } from 'path';

export interface BackupStatus {
  /** La cartella dei dump esiste (sul Mac di sviluppo di solito no). */
  configured: boolean;
  dir: string;
  count: number;
  totalBytes: number;
  latest: { file: string; sizeBytes: number; at: string; ageHours: number } | null;
  /** Ultimo dump più vecchio di STALE_BACKUP_HOURS (il cron è giornaliero). */
  stale: boolean;
}

export interface MemoryStatus {
  totalMb: number;
  /** MemAvailable di /proc/meminfo (comprende la cache liberabile), non MemFree. */
  availableMb: number;
  usedPct: number;
  low: boolean;
}

export interface DiskStatus {
  path: string;
  totalGb: number;
  freeGb: number;
  usedPct: number;
  low: boolean;
}

export interface MongoStatus {
  residentMb: number | null;
  connections: number | null;
  uptimeHours: number | null;
}

export interface WorkflowRun {
  name: string;
  /** success | failure | cancelled | null (in corso) */
  conclusion: string | null;
  status: string;
  at: string;
  url: string;
}

export interface GithubStatus {
  configured: boolean;
  offsiteBackup: WorkflowRun | null;
  uptime: {
    last: WorkflowRun | null;
    /** % di controlli riusciti tra gli ultimi (≈ 25 h a 15 min l'uno) */
    successPct: number | null;
    checks: number;
  };
}

export interface ServerHealth {
  backups: BackupStatus;
  memory: MemoryStatus;
  disk: DiskStatus | null;
  mongo: MongoStatus;
  load: number[];
  github: GithubStatus;
  warnings: string[];
}

export const STALE_BACKUP_HOURS = 26;
const LOW_MEMORY_MB = 150;
const LOW_DISK_PCT = 10;
const GITHUB_TTL_MS = 10 * 60_000;
const GITHUB_RETRY_MS = 2 * 60_000;
const BACKUP_FILE = /^mongo-backup-.*\.archive\.gz$/;

/** Righe "Chiave:   123 kB" di /proc/meminfo → MB. */
export function parseMeminfo(text: string): { totalMb: number; availableMb: number } | null {
  const kb = (key: string) => {
    const m = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'm').exec(text);
    return m ? Number(m[1]) : null;
  };
  const total = kb('MemTotal');
  const available = kb('MemAvailable');
  if (total === null || available === null) return null;
  return { totalMb: Math.round(total / 1024), availableMb: Math.round(available / 1024) };
}

export function successRate(runs: Array<{ conclusion: string | null }>): number | null {
  const done = runs.filter((r) => r.conclusion !== null);
  if (!done.length) return null;
  return Math.round((done.filter((r) => r.conclusion === 'success').length / done.length) * 1000) / 10;
}

/**
 * Stato del server Plesk visto dal backend stesso: dump di Mongo in
 * ~/app/backups (cron 03:30), RAM (1.8 GB senza swap), disco, mongod, e gli
 * ultimi run dei workflow GitHub di backup esterno e uptime.
 */
@Injectable()
export class ServerHealthService {
  private readonly logger = new Logger(ServerHealthService.name);
  private githubCache: { at: number; value: GithubStatus } | null = null;

  constructor(
    private readonly config: ConfigService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
  ) {}

  async snapshot(now = new Date()): Promise<ServerHealth> {
    const [backups, memory, disk, mongo, github] = await Promise.all([
      this.backups(now),
      this.memory(),
      this.disk(),
      this.mongo(),
      this.github(now.getTime()),
    ]);

    const warnings: string[] = [];
    if (backups.configured && (backups.stale || !backups.latest)) warnings.push('backup_stale');
    if (memory.low) warnings.push('memory_low');
    if (disk?.low) warnings.push('disk_low');
    if (github.offsiteBackup && github.offsiteBackup.conclusion && github.offsiteBackup.conclusion !== 'success') warnings.push('offsite_backup_failed');
    if (github.uptime.last && github.uptime.last.conclusion && github.uptime.last.conclusion !== 'success') warnings.push('uptime_failed');

    return { backups, memory, disk, mongo, load: loadavg().map((n) => Math.round(n * 100) / 100), github, warnings };
  }

  backupDir(): string {
    return this.config.get<string>('BACKUP_DIR') || join(homedir(), 'app', 'backups');
  }

  async backups(now = new Date()): Promise<BackupStatus> {
    const dir = this.backupDir();
    const empty: BackupStatus = { configured: false, dir, count: 0, totalBytes: 0, latest: null, stale: false };
    let names: string[];
    try {
      names = (await fs.readdir(dir)).filter((n) => BACKUP_FILE.test(n));
    } catch {
      return empty;
    }

    const files = await Promise.all(
      names.map(async (file) => {
        const st = await fs.stat(join(dir, file)).catch(() => null);
        return st ? { file, size: st.size, mtime: st.mtime } : null;
      }),
    );
    const valid = files.filter((f): f is { file: string; size: number; mtime: Date } => f !== null);
    valid.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const newest = valid[0];
    const ageHours = newest ? Math.round(((now.getTime() - newest.mtime.getTime()) / 3_600_000) * 10) / 10 : null;

    return {
      configured: true,
      dir,
      count: valid.length,
      totalBytes: valid.reduce((s, f) => s + f.size, 0),
      latest: newest ? { file: newest.file, sizeBytes: newest.size, at: newest.mtime.toISOString(), ageHours: ageHours! } : null,
      stale: !newest || ageHours! > STALE_BACKUP_HOURS,
    };
  }

  async memory(): Promise<MemoryStatus> {
    let parsed: { totalMb: number; availableMb: number } | null = null;
    try {
      parsed = parseMeminfo(await fs.readFile('/proc/meminfo', 'utf8'));
    } catch {
      /* non Linux */
    }
    const totalMb = parsed?.totalMb ?? Math.round(totalmem() / 1048576);
    const availableMb = parsed?.availableMb ?? Math.round(freemem() / 1048576);
    return {
      totalMb,
      availableMb,
      usedPct: totalMb ? Math.round(((totalMb - availableMb) / totalMb) * 100) : 0,
      low: availableMb < LOW_MEMORY_MB,
    };
  }

  async disk(): Promise<DiskStatus | null> {
    const path = homedir();
    try {
      const st = await fs.statfs(path);
      const total = st.blocks * st.bsize;
      const free = st.bavail * st.bsize;
      const freePct = total ? (free / total) * 100 : 100;
      return {
        path,
        totalGb: Math.round((total / 1073741824) * 10) / 10,
        freeGb: Math.round((free / 1073741824) * 10) / 10,
        usedPct: Math.round(100 - freePct),
        low: freePct < LOW_DISK_PCT,
      };
    } catch {
      return null;
    }
  }

  /** serverStatus richiede il ruolo clusterMonitor: senza, i campi restano null. */
  async mongo(): Promise<MongoStatus> {
    const none: MongoStatus = { residentMb: null, connections: null, uptimeHours: null };
    const db = this.connection?.db;
    if (!db) return none;
    try {
      const s = (await db.admin().serverStatus()) as { mem?: { resident?: number }; connections?: { current?: number }; uptime?: number };
      return {
        residentMb: s.mem?.resident ?? null,
        connections: s.connections?.current ?? null,
        uptimeHours: typeof s.uptime === 'number' ? Math.round((s.uptime / 3600) * 10) / 10 : null,
      };
    } catch {
      return none;
    }
  }

  /** API pubblica di GitHub (repo pubblico): 2 richieste ogni 10 minuti, ben sotto il limite di 60/h. */
  async github(now = Date.now()): Promise<GithubStatus> {
    if (this.githubCache && now - this.githubCache.at < GITHUB_TTL_MS) return this.githubCache.value;
    const repo = this.config.get<string>('GITHUB_REPO') || 'gents88/site-sallaku';
    const token = this.config.get<string>('GITHUB_TOKEN');
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'gentsallaku-backend' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const runs = async (workflow: string, perPage: number): Promise<WorkflowRun[] | null> => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs?per_page=${perPage}&exclude_pull_requests=true`,
          { headers, signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { workflow_runs?: Array<{ name: string; conclusion: string | null; status: string; updated_at: string; html_url: string }> };
        return (body.workflow_runs ?? []).map((r) => ({ name: r.name, conclusion: r.conclusion, status: r.status, at: r.updated_at, url: r.html_url }));
      } catch (err) {
        this.logger.debug(`GitHub ${workflow}: ${(err as Error).message}`);
        return null;
      }
    };

    const [backupRuns, uptimeRuns] = await Promise.all([runs('mongo-backup.yml', 1), runs('uptime.yml', 100)]);
    const value: GithubStatus = {
      configured: backupRuns !== null || uptimeRuns !== null,
      offsiteBackup: backupRuns?.[0] ?? null,
      uptime: {
        last: uptimeRuns?.[0] ?? null,
        successPct: uptimeRuns ? successRate(uptimeRuns) : null,
        checks: uptimeRuns?.filter((r) => r.conclusion !== null).length ?? 0,
      },
    };
    // Un fallimento (rete, limite di GitHub) si riprova dopo 2 minuti, non a ogni giro della dashboard.
    this.githubCache = { at: value.configured ? now : now - GITHUB_TTL_MS + GITHUB_RETRY_MS, value };
    return value;
  }
}
