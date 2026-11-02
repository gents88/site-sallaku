/**
 * Trasforma il testo di un messaggio della chat nell'HTML mostrato nella bolla
 * (`[innerHTML]`). Il testo arriva dal modello AI e, nella chat live, da un
 * altro visitatore: va sempre trattato come non fidato. Angular ripulisce
 * comunque l'innerHTML, ma l'escape evita che tag e immagini iniettati
 * vengano mostrati o caricati.
 */
export function formatChatMessage(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}
