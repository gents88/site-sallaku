/**
 * Lo streaming mostra il testo mentre arriva, ma la risposta del modello finisce con righe di servizio
 * (`LIVE_OFFER: true`, `SUGGESTIONS: a | b | c`) che il visitatore non deve mai vedere comparire e sparire.
 * Il filtro lascia passare il testo e trattiene tutto da quando una riga comincia con un marcatore
 * (o potrebbe ancora diventarlo). Alla fine il testo pulito esce comunque dal parser finale.
 */
const MARKERS = ['SUGGESTIONS:', 'LIVE_OFFER:'];
const MARKER_START = /(^|\n)[ \t]*(SUGGESTIONS|LIVE_OFFER)[ \t]*:/i;

export class StreamMarkerFilter {
  private all = '';
  private emitted = 0;
  private blocked = false;

  /** Aggiunge un pezzo di testo e restituisce la parte che si può mostrare ora (può essere vuota). */
  push(chunk: string): string {
    if (this.blocked || !chunk) return '';
    this.all += chunk;

    const m = MARKER_START.exec(this.all);
    if (m) {
      this.blocked = true;
      const cut = m.index + (m[1] ? m[1].length : 0);
      return this.take(Math.max(cut, this.emitted));
    }

    // Una riga incompleta che potrebbe ancora diventare un marcatore ("SUGG", "LIVE_O"…) resta in attesa.
    const lineStart = this.all.lastIndexOf('\n') + 1;
    const tail = this.all.slice(lineStart).replace(/^[ \t]+/, '').toUpperCase();
    const mayBecomeMarker = tail.length > 0 && MARKERS.some((mk) => mk.startsWith(tail) || tail.startsWith(mk));
    return this.take(mayBecomeMarker ? Math.max(lineStart, this.emitted) : this.all.length);
  }

  private take(upTo: number): string {
    const out = this.all.slice(this.emitted, upTo);
    this.emitted = Math.max(this.emitted, upTo);
    return out;
  }
}
