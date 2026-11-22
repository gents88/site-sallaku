/** Sezioni richiudibili della dashboard (id degli elementi, usati anche dall'indice). */
export const COLLAPSIBLE_SECTIONS = [
  'dash-ops',
  'dash-content',
  'dash-activity',
  'dash-visitors',
  'dash-acquisition',
  'dash-seo',
  'dash-utility',
  'dash-chat',
  'dash-messages',
] as const;

const STORAGE_KEY = 'admin_dashboard_open_sections_v2';

/**
 * Sezioni aperte, come le ha lasciate l'admin in questo browser. Alla prima
 * visita (o se lo storage non è disponibile) sono tutte chiuse: in alto restano i numeri chiave e
 * le cose da fare, e ogni intestazione riassume in una riga cosa c'è dentro.
 */
export function loadOpenSections(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Set<string> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) return new Set(ids.filter((id): id is string => typeof id === 'string'));
    }
  } catch {
    /* valore corrotto o storage bloccato: si riparte da tutte chiuse */
  }
  return new Set();
}

export function saveOpenSections(open: ReadonlySet<string>, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify([...open]));
  } catch {
    /* storage pieno o bloccato: la scelta vale solo per questa visita */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
