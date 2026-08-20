import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { LibraryService, LibrarySearchHit } from './library.service';

export interface AskCitation {
  page: number;
  docTitle: string;
}

export interface AskAnswer {
  answer: string;
  /** false quando il modello dichiara che i passaggi non contengono la risposta. */
  grounded: boolean;
  citations: AskCitation[];
  processingTime: number;
}

export interface AskPassage {
  docTitle: string;
  page: number;
  text: string;
}

/** Quanti passaggi accompagnano la domanda. Il backend ne accetta al massimo 12. */
const MAX_PASSAGES = 6;
/** Taglio per passaggio: il DTO lato server rifiuta oltre 4000 caratteri. */
const MAX_PASSAGE_CHARS = 3500;

@Injectable({ providedIn: 'root' })
export class LibraryChatService {
  private readonly api = `${environment.apiUrl}/ai`;
  private readonly http = inject(HttpClient);
  private readonly library = inject(LibraryService);

  /**
   * Recupera i passaggi più pertinenti dalla libreria locale.
   *
   * È la metà "retrieval" del RAG e resta interamente nel browser: il server
   * non ha i documenti, riceve solo questi pochi estratti.
   */
  async retrieve(question: string, docId?: string): Promise<AskPassage[]> {
    const hits = await this.library.search(question, MAX_PASSAGES, docId);
    if (hits.length === 0) return [];

    // Lo snippet serve all'occhio umano, troppo corto per rispondere: qui
    // rileggiamo il testo pieno delle pagine che hanno fatto match.
    const passages: AskPassage[] = [];
    const byDoc = new Map<string, LibrarySearchHit[]>();
    for (const hit of hits) {
      byDoc.set(hit.docId, [...(byDoc.get(hit.docId) ?? []), hit]);
    }

    for (const [id, docHits] of byDoc) {
      const pages = await this.library.pagesOf(id);
      const title = this.library.get(id)?.title ?? docHits[0].title;
      for (const hit of docHits) {
        const page = pages.find((p) => p.page === hit.page);
        if (!page?.text.trim()) continue;
        passages.push({ docTitle: title, page: hit.page, text: page.text.slice(0, MAX_PASSAGE_CHARS) });
      }
    }

    return passages.slice(0, MAX_PASSAGES);
  }

  ask(question: string, passages: AskPassage[], lang: string): Observable<AskAnswer> {
    return this.http.post<AskAnswer>(`${this.api}/ask-document`, { question, passages, lang });
  }
}
