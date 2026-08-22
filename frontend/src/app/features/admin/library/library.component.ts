import {
  Component, ChangeDetectionStrategy, OnInit, PLATFORM_ID, inject, signal, computed,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { SeoService } from '../../../core/services/seo.service';
import { WorkspaceService } from '../../../core/services/workspace.service';
import { AnalyticsTrackingService } from '../../../core/services/analytics-tracking.service';
import { PdfjsService } from '../../../core/services/pdfjs.service';
import {
  LibraryService, LibraryDoc, LibrarySearchHit, HIGHLIGHT_OPEN, HIGHLIGHT_CLOSE,
} from '../../../core/services/library.service';
import { LibraryChatService, AskCitation } from '../../../core/services/library-chat.service';

interface ToolAction {
  id: string;
  icon: string;
  route: string;
}

/** Tool che accettano un PDF dal Workspace. `viewer` è a parte: apre il documento dalla libreria. */
const TOOL_ACTIONS: ToolAction[] = [
  { id: 'pdf_summary', icon: '📋', route: '/lab/pdf-summary' },
  { id: 'pdf_translate', icon: '🌐', route: '/lab/pdf-translate' },
  { id: 'ocr', icon: '🔤', route: '/lab/ocr' },
  { id: 'convert', icon: '🔄', route: '/lab/convert' },
  { id: 'pdf_editor', icon: '🖊️', route: '/lab/pdf-editor' },
];

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: AskCitation[];
  /** true quando il modello ha dichiarato di non trovare la risposta nei passaggi. */
  ungrounded?: boolean;
}

/** Segmento di snippet: `hit` distingue i termini trovati, evidenziati dal template senza iniettare HTML. */
export interface SnippetPart {
  text: string;
  hit: boolean;
}

export type SortOrder = 'recent' | 'title' | 'size';

@Component({
  selector: 'app-library',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './library.component.html',
  styleUrls: ['./library.component.scss'],
})
export class LibraryComponent implements OnInit {
  private readonly library = inject(LibraryService);
  private readonly chat = inject(LibraryChatService);
  private readonly pdfjs = inject(PdfjsService);
  private readonly workspace = inject(WorkspaceService);
  private readonly analytics = inject(AnalyticsTrackingService);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly translate = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly toolActions = TOOL_ACTIONS;
  /**
   * Array stabile, non un letterale nel template: un `[1,2,3,4]` scritto inline
   * viene ricreato a ogni ciclo di change detection e impedisce all'app di
   * stabilizzarsi, cosa che in SSR blocca il prerender fino al timeout.
   */
  readonly skeletonPlaceholders = [1, 2, 3, 4];

  readonly docs = this.library.docs;
  readonly ready = this.library.ready;
  readonly error = signal('');

  readonly activeTag = signal<string | null>(null);
  readonly sortBy = signal<SortOrder>('recent');
  readonly openMenuId = signal<string | null>(null);
  readonly tagEditorId = signal<string | null>(null);
  readonly tagDraft = signal('');

  /** id dei documenti la cui estrazione testo è in corso, con la percentuale raggiunta. */
  readonly indexing = signal<Record<string, number>>({});
  readonly importing = signal(false);

  // ── Ricerca full-text ──────────────────────────────────────────────
  readonly query = signal('');
  readonly hits = signal<LibrarySearchHit[]>([]);
  readonly searching = signal(false);
  readonly hasSearched = signal(false);

  // ── Chat ───────────────────────────────────────────────────────────
  readonly chatOpen = signal(false);
  readonly chatScope = signal<string | null>(null);
  readonly chatInput = signal('');
  readonly messages = signal<ChatMessage[]>([]);
  readonly asking = signal(false);

  readonly tags = computed(() => {
    this.docs();
    return this.library.allTags();
  });

  readonly visibleDocs = computed<LibraryDoc[]>(() => {
    const tag = this.activeTag();
    const list = tag ? this.docs().filter((d) => d.tags.includes(tag)) : [...this.docs()];
    switch (this.sortBy()) {
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'size':
        return list.sort((a, b) => b.size - a.size);
      default:
        return list.sort((a, b) => b.addedAt - a.addedAt);
    }
  });

  readonly indexedCount = computed(() => this.docs().filter((d) => d.indexedAt !== null).length);
  readonly pendingIndexCount = computed(() => this.docs().filter((d) => d.indexedAt === null).length);
  readonly usedLabel = computed(() => this.formatSize(this.library.usedBytes()));

  readonly chatScopeTitle = computed(() => {
    const id = this.chatScope();
    return id ? (this.library.get(id)?.title ?? '') : '';
  });

  /** Il documento va indicizzato prima di poter essere cercato o interrogato. */
  readonly searchableCount = computed(
    () => this.docs().filter((d) => d.indexedAt !== null && !d.isScanned).length,
  );

  ngOnInit(): void {
    void this.init();

    this.seo.update({
      title: 'La Mia Libreria PDF — Archivio Personale con Ricerca e Chat AI',
      description:
        'Salva i PDF trovati, cercali per contenuto pagina per pagina, annotali e fai domande ai tuoi documenti. Tutto resta nel tuo browser, nessun caricamento sul server.',
      url: 'https://gentsallaku.it/lab/library',
    });
    this.seo.injectJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Libreria PDF personale',
      description:
        'Archivio PDF personale nel browser con ricerca full-text dentro i documenti, annotazioni e domande ai propri documenti.',
      url: 'https://gentsallaku.it/lab/library',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      featureList: [
        'Archivio PDF locale',
        'Ricerca full-text nei documenti',
        'Annotazioni ed evidenziazioni',
        'Domande ai propri documenti',
      ],
      provider: { '@type': 'Person', name: 'Gent Sallaku', url: 'https://gentsallaku.it' },
    });
  }

  private async init(): Promise<void> {
    await this.library.refresh();
    await this.adoptFromWorkspace();
  }

  /**
   * Raccoglie il PDF che un altro tool ha mandato al Workspace.
   * È il lato ricevente del "manda a" degli altri strumenti: senza questo, la
   * Libreria comparirebbe fra le destinazioni ma il file non arriverebbe mai.
   */
  private async adoptFromWorkspace(): Promise<void> {
    const item = this.workspace.peek();
    if (!item || item.kind !== 'file' || !item.blob) return;
    if (item.mime && item.mime !== 'application/pdf') return;
    // Un file appena rimandato qui dalla Libreria stessa sarebbe un giro a vuoto.
    if (item.fromTool === 'library') return;

    // take() consuma l'elemento: senza, tornando sulla pagina lo si
    // reimporterebbe a ogni visita.
    this.workspace.take();
    // Archiviazione e indicizzazione richiedono qualche istante su un libro
    // grosso: senza questo, la pagina resterebbe vuota senza spiegazione.
    this.importing.set(true);
    try {
      await this.adopt(item.blob, item.filename, item.fromTool);
    } finally {
      this.importing.set(false);
    }
  }

  private async adopt(blob: Blob, filename: string, fromTool: string): Promise<void> {
    const title = filename.replace(/\.pdf$/i, '');
    const doc = await this.library.add(
      {
        id: `workspace-${filename}-${blob.size}`,
        title,
        author: '',
        year: '',
        source: 'upload',
        sourceLabel: this.translate.instant('library.source_upload'),
        detailsUrl: '',
        coverUrl: null,
      },
      blob,
    );
    this.analytics.trackClick('library_adopt_workspace', fromTool);
    await this.indexDoc(doc.id);
  }

  // ── Import ─────────────────────────────────────────────────────────

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.importFiles(input.files);
    // Azzerato perché ricaricare lo stesso file di fila non emetta un change vuoto.
    input.value = '';
  }

  async importFiles(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    this.importing.set(true);
    this.error.set('');
    let skipped = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { skipped++; continue; }
        const doc = await this.library.add(
          {
            id: `upload-${file.name}-${file.size}`,
            title: file.name.replace(/\.pdf$/i, ''),
            author: '',
            year: '',
            source: 'upload',
            sourceLabel: this.translate.instant('library.source_upload'),
            detailsUrl: '',
            coverUrl: null,
          },
          file,
        );
        await this.indexDoc(doc.id);
      }
      this.analytics.trackClick('library_import', String(files.length));
      // Non un errore: alcuni file semplicemente non erano PDF. Senza questo
      // messaggio l'utente non capisce perché un file "sparisce" dall'import.
      if (skipped > 0) this.error.set(this.translate.instant('library.import_skipped', { count: skipped }));
    } catch {
      this.error.set(this.translate.instant('library.err_import'));
    } finally {
      this.importing.set(false);
    }
  }

  // ── Indicizzazione ─────────────────────────────────────────────────

  /**
   * Estrae il testo del PDF pagina per pagina e lo salva.
   * Senza questo passaggio il documento è archiviato ma invisibile a ricerca e chat.
   */
  async indexDoc(id: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const blob = await this.library.getBlob(id);
    if (!blob) return;

    this.setProgress(id, 0);
    try {
      const doc = await this.pdfjs.openDocument(await blob.arrayBuffer());
      const pages = await this.pdfjs.extractPages(doc, (done, total) =>
        this.setProgress(id, Math.round((done / total) * 100)),
      );
      await this.library.indexPages(id, pages);
      await doc.loadingTask.destroy();
    } catch {
      this.error.set(this.translate.instant('library.err_index'));
    } finally {
      this.clearProgress(id);
    }
  }

  /** Indicizza in sequenza, non in parallelo: pdf.js su più libri insieme satura la memoria del tab. */
  async indexAllPending(): Promise<void> {
    for (const doc of this.docs().filter((d) => d.indexedAt === null)) {
      await this.indexDoc(doc.id);
    }
  }

  progressOf(id: string): number | null {
    return this.indexing()[id] ?? null;
  }

  private setProgress(id: string, value: number): void {
    this.indexing.update((m) => ({ ...m, [id]: value }));
  }

  private clearProgress(id: string): void {
    this.indexing.update((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  }

  // ── Azioni sul documento ───────────────────────────────────────────

  toggleMenu(id: string): void {
    this.openMenuId.update((current) => (current === id ? null : id));
  }

  openInViewer(doc: LibraryDoc, page?: number): void {
    this.analytics.trackClick('library_open_viewer', doc.source);
    void this.router.navigate(['/lab/viewer'], {
      queryParams: { doc: doc.id, ...(page ? { page } : {}) },
    });
  }

  /** Manda il PDF al Workspace e apre il tool scelto, che lo ritrova già caricato. */
  async sendToTool(doc: LibraryDoc, action: ToolAction): Promise<void> {
    const blob = await this.library.getBlob(doc.id);
    if (!blob) return;
    this.workspace.send({
      kind: 'file',
      blob,
      filename: `${this.safeFilename(doc.title)}.pdf`,
      mime: 'application/pdf',
      fromTool: 'library',
      libraryDocId: doc.id,
    });
    this.analytics.trackClick('library_send_tool', action.id);
    this.openMenuId.set(null);
    void this.router.navigate([action.route]);
  }

  async download(doc: LibraryDoc): Promise<void> {
    const blob = await this.library.getBlob(doc.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${this.safeFilename(doc.title)}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  async remove(doc: LibraryDoc): Promise<void> {
    await this.library.remove(doc.id);
    this.openMenuId.set(null);
    if (this.chatScope() === doc.id) this.chatScope.set(null);
    // I risultati di ricerca di un documento appena eliminato punterebbero nel vuoto.
    this.hits.update((list) => list.filter((h) => h.docId !== doc.id));
  }

  // ── Tag ────────────────────────────────────────────────────────────

  startTagEdit(doc: LibraryDoc): void {
    this.tagEditorId.set(doc.id);
    this.tagDraft.set(doc.tags.join(', '));
    this.openMenuId.set(null);
  }

  async saveTags(doc: LibraryDoc): Promise<void> {
    await this.library.setTags(doc.id, this.tagDraft().split(','));
    this.tagEditorId.set(null);
    this.tagDraft.set('');
  }

  cancelTagEdit(): void {
    this.tagEditorId.set(null);
    this.tagDraft.set('');
  }

  filterByTag(tag: string | null): void {
    this.activeTag.set(tag);
  }

  // ── Ricerca full-text ──────────────────────────────────────────────

  async runSearch(): Promise<void> {
    const q = this.query().trim();
    if (q.length < 2) return;
    this.searching.set(true);
    this.hasSearched.set(true);
    try {
      this.hits.set(await this.library.search(q));
      this.analytics.trackClick('library_search', q);
    } finally {
      this.searching.set(false);
    }
  }

  clearSearch(): void {
    this.query.set('');
    this.hits.set([]);
    this.hasSearched.set(false);
  }

  /**
   * Spezza lo snippet sui marcatori testuali prodotti dal servizio.
   * Il template stila i pezzi con `hit`, così nulla viene interpretato come HTML.
   */
  snippetParts(snippet: string): SnippetPart[] {
    const parts: SnippetPart[] = [];
    let rest = snippet;
    while (rest.length > 0) {
      const open = rest.indexOf(HIGHLIGHT_OPEN);
      if (open === -1) {
        parts.push({ text: rest, hit: false });
        break;
      }
      const close = rest.indexOf(HIGHLIGHT_CLOSE, open);
      if (close === -1) {
        parts.push({ text: rest, hit: false });
        break;
      }
      if (open > 0) parts.push({ text: rest.slice(0, open), hit: false });
      parts.push({ text: rest.slice(open + 1, close), hit: true });
      rest = rest.slice(close + 1);
    }
    return parts;
  }

  openHit(hit: LibrarySearchHit): void {
    const doc = this.library.get(hit.docId);
    if (doc) this.openInViewer(doc, hit.page);
  }

  // ── Chat ───────────────────────────────────────────────────────────

  openChat(docId: string | null): void {
    this.chatScope.set(docId);
    this.chatOpen.set(true);
    this.openMenuId.set(null);
  }

  closeChat(): void {
    this.chatOpen.set(false);
  }

  clearChat(): void {
    this.messages.set([]);
  }

  async ask(): Promise<void> {
    const question = this.chatInput().trim();
    if (question.length < 3 || this.asking()) return;

    this.messages.update((m) => [...m, { role: 'user', text: question }]);
    this.chatInput.set('');
    this.asking.set(true);

    try {
      const passages = await this.chat.retrieve(question, this.chatScope() ?? undefined);
      if (passages.length === 0) {
        this.messages.update((m) => [
          ...m,
          { role: 'assistant', text: this.translate.instant('library.chat_no_context'), ungrounded: true },
        ]);
        return;
      }

      const lang = this.translate.currentLang || 'it';
      const answer = await firstValueFrom(this.chat.ask(question, passages, lang));

      this.messages.update((m) => [
        ...m,
        {
          role: 'assistant',
          text: answer.answer,
          citations: answer.citations,
          ungrounded: !answer.grounded,
        },
      ]);
      this.analytics.trackClick('library_chat_ask', this.chatScope() ? 'doc' : 'all');
    } catch {
      this.messages.update((m) => [
        ...m,
        { role: 'assistant', text: this.translate.instant('library.chat_error'), ungrounded: true },
      ]);
    } finally {
      this.asking.set(false);
    }
  }

  // ── Utility ────────────────────────────────────────────────────────

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private safeFilename(title: string): string {
    return title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'documento';
  }
}
