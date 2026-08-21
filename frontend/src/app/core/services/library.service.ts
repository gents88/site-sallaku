import { Injectable, signal, inject, PLATFORM_ID, InjectionToken } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Libreria personale: PDF salvati, il loro testo pagina per pagina e le
 * annotazioni dell'utente, tutto in IndexedDB sul dispositivo.
 *
 * Volutamente client-side: i tool /lab sono pubblici e senza login, quindi non
 * esiste un "proprietario" server-side a cui legare la collezione, e tenere i
 * PDF di terzi sul nostro server sarebbe un costo (storage) e un rischio
 * (redistribuzione) senza contropartita. Il prezzo è che la libreria non segue
 * l'utente tra dispositivi — accettato consapevolmente.
 */

export type LibrarySource = 'internet_archive' | 'gutenberg' | 'arxiv' | 'pmc' | 'upload';

export interface LibraryDoc {
  id: string;
  title: string;
  author: string;
  year: string;
  source: LibrarySource;
  sourceLabel: string;
  detailsUrl: string;
  coverUrl: string | null;
  /** Byte del PDF salvato, per mostrare l'occupazione senza aprire il blob. */
  size: number;
  pageCount: number;
  tags: string[];
  addedAt: number;
  /** Timestamp dell'estrazione testo, null finché il documento non è indicizzato. */
  indexedAt: number | null;
  /** Caratteri di testo estratti in totale — circa 0 su una scansione senza layer di testo. */
  textChars: number;
  /** true quando il PDF è quasi certamente una scansione priva di testo selezionabile. */
  isScanned: boolean;
}

export interface LibraryPage {
  /** `${docId}#${page}` — chiave composta esplicita, più semplice da interrogare di un keyPath array. */
  id: string;
  docId: string;
  page: number;
  text: string;
}

export interface LibraryAnnotation {
  id: string;
  docId: string;
  page: number;
  /** Rettangolo in coordinate normalizzate 0..1 sulla pagina, così resta valido a qualsiasi zoom. */
  rect: { x: number; y: number; w: number; h: number };
  color: string;
  /** Testo del PDF coperto dal rettangolo, se estraibile. */
  quote: string;
  /** Commento dell'utente, opzionale. */
  note: string;
  createdAt: number;
}

/** Riga dello store dei file: i byte del PDF, tenuti fuori dallo store dei metadati. */
interface StoredBlob {
  id: string;
  buffer: ArrayBuffer;
  mime: string;
}

export interface LibrarySearchHit {
  docId: string;
  title: string;
  page: number;
  /** Estratto della pagina attorno alla prima occorrenza, con i termini fra HIGHLIGHT_OPEN/CLOSE. */
  snippet: string;
  score: number;
}

const DB_NAME = 'gs-library';
const DB_VERSION = 1;
const STORE_DOCS = 'docs';
const STORE_BLOBS = 'blobs';
const STORE_PAGES = 'pages';
const STORE_ANNOTATIONS = 'annotations';

/** Sotto questa media di caratteri per pagina il PDF è considerato una scansione senza testo. */
const SCANNED_CHARS_PER_PAGE = 15;

const SNIPPET_RADIUS = 90;
/** Marcatori testuali, non HTML: il template li splitta e applica lo stile, senza mai iniettare markup. */
export const HIGHLIGHT_OPEN = '«';
export const HIGHLIGHT_CLOSE = '»';

/** Segni diacritici combinanti, rimossi dopo la normalizzazione NFD. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Iniettabile per i test, dove jsdom non fornisce IndexedDB. */
export const IDB_FACTORY = new InjectionToken<IDBFactory>('IDB_FACTORY', {
  providedIn: 'root',
  factory: () => (typeof indexedDB !== 'undefined' ? indexedDB : (null as unknown as IDBFactory)),
});

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Minuscole, senza diacritici, spezzato sui non-alfanumerici: stessa normalizzazione per indice e query. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly idb = inject(IDB_FACTORY);
  private dbPromise: Promise<IDBDatabase> | null = null;
  private lastAddedAt = 0;

  /**
   * Timestamp strettamente crescente per `addedAt`. `Date.now()` da solo ha
   * risoluzione di millisecondo: salvare due documenti in rapida successione
   * (import multiplo, o due ricerche salvate di fila) può produrre lo stesso
   * valore, e `getAll()` di IndexedDB non garantisce l'ordine di inserimento
   * a parità di chiave di ordinamento — l'elenco "più recenti prima" può
   * uscire nell'ordine sbagliato. Bump esplicito quando l'orologio non è
   * ancora avanzato risolve alla radice, senza dipendere dalla granularità del clock.
   */
  private nextAddedAt(): number {
    const now = Date.now();
    this.lastAddedAt = now > this.lastAddedAt ? now : this.lastAddedAt + 1;
    return this.lastAddedAt;
  }

  /** Elenco documenti in memoria, riallineato dopo ogni scrittura così le viste sono reattive. */
  private readonly _docs = signal<LibraryDoc[]>([]);
  readonly docs = this._docs.asReadonly();
  readonly ready = signal(false);

  available(): boolean {
    return isPlatformBrowser(this.platformId) && !!this.idb;
  }

  private open(): Promise<IDBDatabase> {
    if (!this.available()) return Promise.reject(new Error('IndexedDB non disponibile'));
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.idb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_DOCS)) {
            db.createObjectStore(STORE_DOCS, { keyPath: 'id' }).createIndex('addedAt', 'addedAt');
          }
          if (!db.objectStoreNames.contains(STORE_BLOBS)) {
            db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_PAGES)) {
            db.createObjectStore(STORE_PAGES, { keyPath: 'id' }).createIndex('docId', 'docId');
          }
          if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
            db.createObjectStore(STORE_ANNOTATIONS, { keyPath: 'id' }).createIndex('docId', 'docId');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  /** Carica l'elenco documenti in memoria. Idempotente: le viste possono chiamarla a ogni ngOnInit. */
  async refresh(): Promise<LibraryDoc[]> {
    if (!this.available()) {
      this.ready.set(true);
      return [];
    }
    const db = await this.open();
    const tx = db.transaction(STORE_DOCS, 'readonly');
    const all = await req(tx.objectStore(STORE_DOCS).getAll() as IDBRequest<LibraryDoc[]>);
    const sorted = all.sort((a, b) => b.addedAt - a.addedAt);
    this._docs.set(sorted);
    this.ready.set(true);
    return sorted;
  }

  has(id: string): boolean {
    return this._docs().some((d) => d.id === id);
  }

  get(id: string): LibraryDoc | undefined {
    return this._docs().find((d) => d.id === id);
  }

  /**
   * Salva un PDF. `meta.id` è la chiave di deduplica: risalvare lo stesso
   * risultato di ricerca aggiorna il documento invece di duplicarlo.
   */
  async add(
    meta: Omit<LibraryDoc, 'size' | 'addedAt' | 'indexedAt' | 'textChars' | 'isScanned' | 'tags' | 'pageCount'> &
      Partial<Pick<LibraryDoc, 'tags' | 'pageCount'>>,
    blob: Blob,
  ): Promise<LibraryDoc> {
    const db = await this.open();
    const existing = this.get(meta.id);
    const doc: LibraryDoc = {
      pageCount: 0,
      tags: [],
      ...existing,
      ...meta,
      size: blob.size,
      addedAt: existing?.addedAt ?? this.nextAddedAt(),
      // Il testo indicizzato si riferiva al blob precedente: va rifatto, non ereditato.
      indexedAt: null,
      textChars: 0,
      isScanned: false,
    };
    // Salvato come ArrayBuffer, non come Blob: Safari ha una storia di bug nel
    // conservare Blob dentro IndexedDB, mentre i buffer sono supportati ovunque.
    const buffer = await blob.arrayBuffer();
    const tx = db.transaction([STORE_DOCS, STORE_BLOBS], 'readwrite');
    tx.objectStore(STORE_DOCS).put(doc);
    tx.objectStore(STORE_BLOBS).put({ id: doc.id, buffer, mime: blob.type || 'application/pdf' });
    await done(tx);
    this.upsertLocal(doc);
    return doc;
  }

  async getBlob(id: string): Promise<Blob | null> {
    const db = await this.open();
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const row = await req(
      tx.objectStore(STORE_BLOBS).get(id) as IDBRequest<StoredBlob | undefined>,
    );
    return row ? new Blob([row.buffer], { type: row.mime }) : null;
  }

  /** Rimuove documento, blob, testo indicizzato e annotazioni in un'unica transazione. */
  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([STORE_DOCS, STORE_BLOBS, STORE_PAGES, STORE_ANNOTATIONS], 'readwrite');
    tx.objectStore(STORE_DOCS).delete(id);
    tx.objectStore(STORE_BLOBS).delete(id);
    for (const store of [STORE_PAGES, STORE_ANNOTATIONS]) {
      this.deleteByDocId(tx.objectStore(store), id);
    }
    await done(tx);
    this._docs.update((list) => list.filter((d) => d.id !== id));
  }

  /** Cancella via cursore tutte le righe con quel docId. Va chiamata dentro una transazione già aperta. */
  private deleteByDocId(store: IDBObjectStore, docId: string, onDone?: () => void): void {
    const cursorReq = store.index('docId').openCursor(IDBKeyRange.only(docId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        onDone?.();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
  }

  async setTags(id: string, tags: string[]): Promise<void> {
    const doc = this.get(id);
    if (!doc) return;
    const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    const updated = { ...doc, tags: cleaned };
    const db = await this.open();
    const tx = db.transaction(STORE_DOCS, 'readwrite');
    tx.objectStore(STORE_DOCS).put(updated);
    await done(tx);
    this.upsertLocal(updated);
  }

  allTags(): string[] {
    return [...new Set(this._docs().flatMap((d) => d.tags))].sort((a, b) => a.localeCompare(b));
  }

  // ── Testo indicizzato ────────────────────────────────────────────────

  /** Sostituisce il testo indicizzato del documento e ne aggiorna i contatori. */
  async indexPages(docId: string, pages: { page: number; text: string }[]): Promise<LibraryDoc | null> {
    const doc = this.get(docId);
    if (!doc) return null;
    const db = await this.open();
    const tx = db.transaction([STORE_PAGES, STORE_DOCS], 'readwrite');
    const pageStore = tx.objectStore(STORE_PAGES);

    // Le nuove pagine si scrivono solo dopo che il cursore ha finito di ripulire
    // le vecchie, altrimenti il cursore stesso cancellerebbe quelle appena messe.
    this.deleteByDocId(pageStore, docId, () => {
      for (const p of pages) {
        const row: LibraryPage = { id: `${docId}#${p.page}`, docId, page: p.page, text: p.text };
        pageStore.put(row);
      }
    });

    const textChars = pages.reduce((sum, p) => sum + p.text.trim().length, 0);
    const updated: LibraryDoc = {
      ...doc,
      pageCount: pages.length || doc.pageCount,
      indexedAt: Date.now(),
      textChars,
      isScanned: pages.length > 0 && textChars / pages.length < SCANNED_CHARS_PER_PAGE,
    };
    tx.objectStore(STORE_DOCS).put(updated);
    await done(tx);
    this.upsertLocal(updated);
    return updated;
  }

  async pagesOf(docId: string): Promise<LibraryPage[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const rows = await req(
      tx.objectStore(STORE_PAGES).index('docId').getAll(IDBKeyRange.only(docId)) as IDBRequest<LibraryPage[]>,
    );
    return rows.sort((a, b) => a.page - b.page);
  }

  /**
   * Ricerca full-text su tutte le pagine indicizzate (o su un solo documento).
   *
   * Scansione lineare con punteggio per frequenza dei termini, non un vero
   * indice invertito: la libreria è locale e realisticamente nell'ordine delle
   * decine di documenti, quindi il costo è trascurabile e il codice resta
   * leggibile. Se un giorno crescesse, il punto da cambiare è solo questo.
   */
  async search(query: string, limit = 40, docId?: string): Promise<LibrarySearchHit[]> {
    const terms = tokenize(query);
    if (terms.length === 0 || !this.available()) return [];
    const db = await this.open();
    const tx = db.transaction(STORE_PAGES, 'readonly');
    const store = tx.objectStore(STORE_PAGES);
    const rows = await req(
      (docId ? store.index('docId').getAll(IDBKeyRange.only(docId)) : store.getAll()) as IDBRequest<LibraryPage[]>,
    );

    const titles = new Map(this._docs().map((d) => [d.id, d.title]));
    const hits: LibrarySearchHit[] = [];

    for (const row of rows) {
      const haystack = normalizeForSearch(row.text);
      let score = 0;
      let matched = 0;
      let firstAt = -1;
      for (const term of terms) {
        let count = 0;
        let pos = haystack.indexOf(term);
        if (pos !== -1 && (firstAt === -1 || pos < firstAt)) firstAt = pos;
        while (pos !== -1) {
          count++;
          pos = haystack.indexOf(term, pos + term.length);
        }
        if (count > 0) {
          matched++;
          // Saturazione logaritmica: la decima ripetizione di un termine informa
          // molto meno della prima, altrimenti una pagina che martella un solo
          // termine batterebbe quella che li contiene davvero tutti.
          score += 1 + Math.log(count);
        }
      }
      if (matched === 0) continue;
      // Una pagina che contiene tutti i termini vale più di una che ne ripete uno solo.
      score *= matched / terms.length;
      hits.push({
        docId: row.docId,
        title: titles.get(row.docId) ?? '',
        page: row.page,
        snippet: this.buildSnippet(row.text, terms, firstAt),
        score,
      });
    }

    return hits.sort((a, b) => b.score - a.score || a.page - b.page).slice(0, limit);
  }

  /** Ritaglia il contesto attorno alla prima occorrenza e marca i termini trovati. */
  private buildSnippet(text: string, terms: string[], firstAt: number): string {
    const start = Math.max(0, firstAt - SNIPPET_RADIUS);
    const end = Math.min(text.length, firstAt + SNIPPET_RADIUS);
    const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
    const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
    const marked = slice.replace(pattern, `${HIGHLIGHT_OPEN}$1${HIGHLIGHT_CLOSE}`);
    return `${start > 0 ? '… ' : ''}${marked}${end < text.length ? ' …' : ''}`;
  }

  // ── Annotazioni ──────────────────────────────────────────────────────

  async addAnnotation(a: Omit<LibraryAnnotation, 'id' | 'createdAt'>): Promise<LibraryAnnotation> {
    const full: LibraryAnnotation = {
      ...a,
      id: `${a.docId}#${a.page}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    const db = await this.open();
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    tx.objectStore(STORE_ANNOTATIONS).put(full);
    await done(tx);
    return full;
  }

  async updateAnnotation(id: string, patch: Partial<Pick<LibraryAnnotation, 'note' | 'color'>>): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    const store = tx.objectStore(STORE_ANNOTATIONS);
    const current = await req(store.get(id) as IDBRequest<LibraryAnnotation | undefined>);
    if (current) store.put({ ...current, ...patch });
    await done(tx);
  }

  async removeAnnotation(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(STORE_ANNOTATIONS, 'readwrite');
    tx.objectStore(STORE_ANNOTATIONS).delete(id);
    await done(tx);
  }

  async annotationsOf(docId: string): Promise<LibraryAnnotation[]> {
    const db = await this.open();
    const tx = db.transaction(STORE_ANNOTATIONS, 'readonly');
    const rows = await req(
      tx.objectStore(STORE_ANNOTATIONS).index('docId').getAll(IDBKeyRange.only(docId)) as IDBRequest<
        LibraryAnnotation[]
      >,
    );
    return rows.sort((a, b) => a.page - b.page || a.rect.y - b.rect.y);
  }

  /** Spazio occupato dai PDF salvati, in byte. */
  usedBytes(): number {
    return this._docs().reduce((sum, d) => sum + d.size, 0);
  }

  private upsertLocal(doc: LibraryDoc): void {
    this._docs.update((list) => {
      const without = list.filter((d) => d.id !== doc.id);
      return [doc, ...without].sort((a, b) => b.addedAt - a.addedAt);
    });
  }
}
