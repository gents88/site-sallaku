/**
 * Trasforma il testo di un messaggio della chat nell'HTML mostrato nella bolla
 * (`[innerHTML]`). Il testo arriva dal modello AI e, nella chat live, da un
 * altro visitatore: va sempre trattato come non fidato. Angular ripulisce
 * comunque l'innerHTML, ma l'escape evita che tag e immagini iniettati
 * vengano mostrati o caricati.
 */
export function formatChatMessage(content: string): string {
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (t: string) =>
    t
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Elenchi: "- voce", "* voce", "• voce" e "1. voce" diventano <ul>/<ol>. Prima restavano righe con il
  // trattino in mezzo al testo. Le altre righe restano separate da <br>, come prima.
  const bullet = /^\s*[-*•]\s+(.*)$/;
  const numbered = /^\s*\d+[.)]\s+(.*)$/;
  const out: string[] = [];
  const lines = escaped.split('\n');
  let i = 0;
  let text: string[] = [];
  const flushText = () => {
    if (text.length) out.push(text.map(inline).join('<br>'));
    text = [];
  };
  while (i < lines.length) {
    const kind = bullet.test(lines[i]) ? 'ul' : numbered.test(lines[i]) ? 'ol' : null;
    if (!kind) {
      text.push(lines[i]);
      i++;
      continue;
    }
    flushText();
    const re = kind === 'ul' ? bullet : numbered;
    const items: string[] = [];
    while (i < lines.length && re.test(lines[i])) {
      items.push(`<li>${inline((re.exec(lines[i]) as RegExpExecArray)[1])}</li>`);
      i++;
    }
    out.push(`<${kind}>${items.join('')}</${kind}>`);
  }
  flushText();
  return out.join('');
}
