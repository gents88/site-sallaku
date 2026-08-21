import { Injectable, signal, computed } from '@angular/core';

export type WorkspaceKind = 'file' | 'text';

export interface WorkspaceItem {
  kind: WorkspaceKind;
  blob?: Blob;
  text?: string;
  filename: string;
  mime?: string;
  fromTool: string;
  createdAt: number;
  /**
   * Id del documento in Libreria da cui questo elemento proviene, se
   * proviene da lì. Un tool che estrae testo (l'OCR, tipicamente) può usarlo
   * per riscrivere il risultato come testo indicizzato dello stesso
   * documento invece di produrre solo un file scollegato.
   */
  libraryDocId?: string;
}

export interface WorkspaceHistoryEntry {
  filename: string;
  fromTool: string;
  kind: WorkspaceKind;
  createdAt: number;
}

const HISTORY_LIMIT = 5;

/**
 * In-memory-only handoff between the lab tools: one tool "sends" its output here,
 * another tool picks it up on load. Never persisted (files can be large/sensitive) —
 * a reload clears it, same as leaving any of the tools themselves would.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly _current = signal<WorkspaceItem | null>(null);
  private readonly _history = signal<WorkspaceHistoryEntry[]>([]);

  readonly current = this._current.asReadonly();
  readonly history = this._history.asReadonly();
  readonly hasItem = computed(() => this._current() !== null);

  send(item: Omit<WorkspaceItem, 'createdAt'>): void {
    const full: WorkspaceItem = { ...item, createdAt: Date.now() };
    this._current.set(full);
    this._history.update((h) => [
      { filename: full.filename, fromTool: full.fromTool, kind: full.kind, createdAt: full.createdAt },
      ...h,
    ].slice(0, HISTORY_LIMIT));
  }

  /** Reads the pending item without clearing it — a tool may want to peek before committing to load it. */
  peek(): WorkspaceItem | null {
    return this._current();
  }

  /** Consumes the pending item — call once a tool has actually loaded it, so it isn't offered twice. */
  take(): WorkspaceItem | null {
    const item = this._current();
    this._current.set(null);
    return item;
  }

  clear(): void {
    this._current.set(null);
  }
}
