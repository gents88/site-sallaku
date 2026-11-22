/**
 * Pagine del Lab pensate per una ricerca specifica ("unire PDF", "PDF in Word"…).
 * Ognuna riusa il componente di uno strumento esistente (stessa interfaccia, subito
 * utilizzabile) ma ha URL, title, description, H1, testi e dati strutturati propri:
 * chi cerca un compito preciso atterra su una pagina che parla proprio di quello.
 * La rotta passa l'id come `data.labIntent`; vedi LabInfoService.page().
 */
export interface LabIntent {
  /** Strumento (id del registro di navigazione) che la pagina riusa */
  tool: string;
  /** Solo per il convertitore: id della conversione (CONVERSION_TYPES) da proporre */
  conversion?: string;
  /** Icona della voce nel registro (come lo strumento) */
  icon: string;
}

export const LAB_INTENTS: Readonly<Record<string, LabIntent>> = {
  'pdf-to-word': { tool: 'convert', conversion: 'pdf-to-docx', icon: 'swap' },
  'word-to-pdf': { tool: 'convert', conversion: 'docx-to-pdf', icon: 'swap' },
  'jpg-to-pdf': { tool: 'convert', conversion: 'image-to-pdf', icon: 'swap' },
  'merge-pdf': { tool: 'pdf-editor', icon: 'pen' },
  'split-pdf': { tool: 'pdf-editor', icon: 'pen' },
  'rotate-pdf': { tool: 'pdf-editor', icon: 'pen' },
  'image-to-text': { tool: 'ocr', icon: 'text-scan' },
  'heic-to-jpg': { tool: 'image-tools', icon: 'image' },
  'resize-image': { tool: 'image-tools', icon: 'image' },
  'compress-image': { tool: 'image-tools', icon: 'image' },
  'reduce-pdf-size': { tool: 'compress-pdf', icon: 'compress' },
  'fill-pdf': { tool: 'sign-pdf', icon: 'signature' },
  'wifi-qr-code': { tool: 'qr-code', icon: 'qr' },
};

/** Intento a cui appartiene `id`, o null se è uno strumento "normale". */
export function labIntent(id: string | null | undefined): LabIntent | null {
  return id && Object.prototype.hasOwnProperty.call(LAB_INTENTS, id) ? LAB_INTENTS[id] : null;
}
