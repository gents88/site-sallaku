/**
 * Confronta lo stato corrente di un form con l'ultimo salvato.
 *
 * `form.dirty` non basta: chip, traduzioni e immagini vivono fuori dal
 * FormGroup, e dopo un salvataggio (o l'autosave del blog) il form resta
 * "dirty". Uno snapshot del payload copre tutto con una sola regola.
 */
export class DirtyTracker {
  private snapshot: string | null = null;

  /** Da chiamare all'apertura del form e dopo ogni salvataggio riuscito. */
  mark(value: unknown): void {
    this.snapshot = JSON.stringify(value);
  }

  reset(): void {
    this.snapshot = null;
  }

  isDirty(value: unknown): boolean {
    return this.snapshot !== null && JSON.stringify(value) !== this.snapshot;
  }
}
