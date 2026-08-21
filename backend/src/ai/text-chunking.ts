/**
 * Spezza un testo lungo in blocchi entro `maxChars`, provando prima a tagliare
 * su un paragrafo (riga vuota), poi su una frase, e solo come ultima risorsa
 * a metà parola — mai perdendo caratteri, solo ridistribuendoli.
 *
 * Nasce per rompere il troncamento silenzioso di summarizeFile/formatText/
 * translatePdf: prima mandavano al modello solo i primi N caratteri del
 * documento (`text.substring(0, 8000)` e simili), riassumendo o traducendo
 * di fatto solo le prime pagine di qualunque file più lungo, senza avvisare
 * l'utente. Con questo, il documento intero viene processato a blocchi.
 */
export function chunkText(text: string, maxChars: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > 0) {
    if (rest.length <= maxChars) {
      chunks.push(rest.trim());
      break;
    }

    const window = rest.slice(0, maxChars);
    const cut = findCutPoint(window, rest);

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trimStart();
  }

  return chunks.filter((c) => c.length > 0);
}

/** Ritorna l'indice migliore per tagliare `rest` entro la finestra `window`, senza mai tagliare una parola quando c'è un'alternativa. */
function findCutPoint(window: string, rest: string): number {
  const paragraphBreak = window.lastIndexOf('\n\n');
  if (paragraphBreak > window.length * 0.4) return paragraphBreak + 2;

  const sentenceBreak = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (sentenceBreak > window.length * 0.4) return sentenceBreak + 2;

  const spaceBreak = window.lastIndexOf(' ');
  if (spaceBreak > window.length * 0.4) return spaceBreak + 1;

  // Nessun punto di taglio ragionevole (es. un'unica parola lunghissima): taglia netto piuttosto che loopare all'infinito.
  return Math.min(window.length, rest.length);
}
