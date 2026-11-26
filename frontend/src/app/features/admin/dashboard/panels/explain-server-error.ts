/**
 * Spiegazione in parole semplici di un errore del server, per il pannello "Errori del server" della dashboard.
 * Solo in italiano, apposta: la legge solo chi amministra il sito, quindi non passa dai file di traduzione.
 *
 * Regole in ordine, la prima che corrisponde vince. Cercano parole nel nome e nel messaggio dell'errore
 * (non sono esaustive: per ciò che non riconoscono resta la spiegazione generica, con un invito a guardare lo stack).
 */
export interface ErrorLike {
  name: string;
  message: string;
  status: number;
  route: string;
}

export interface ErrorExplanation {
  /** Cosa è successo, in una frase. */
  text: string;
  /** Cosa fare (o non fare). */
  advice: string;
  /** "passeggero": di solito si risolve da solo. "da-guardare": serve un intervento. */
  kind: 'passeggero' | 'da-guardare';
}

/** Di cosa si stava occupando la richiesta, dalla rotta. Serve a dire "la ricerca PDF", non solo "un servizio". */
const AREAS: [RegExp, string][] = [
  [/\/pdf-search\/proxy/, 'lo scaricamento di un PDF da una fonte esterna (Internet Archive, arXiv…)'],
  [/\/pdf-search/, 'la Ricerca PDF'],
  [/\/chatbot|\/chat\b/, 'il chatbot'],
  [/\/blog/, 'il blog'],
  [/\/contact/, 'il modulo di contatto'],
  [/\/auth|\/users/, 'il login o gli account'],
  [/\/analytics|\/stats/, 'le statistiche'],
  [/\/newsletter/, "l'iscrizione alla newsletter"],
  [/\/(pdf|ocr|convert|summary|translate|ai)/, 'uno strumento del Lab'],
  [/\/search/, 'la ricerca nel sito'],
];

function area(route: string): string | null {
  return AREAS.find(([re]) => re.test(route))?.[1] ?? null;
}

const TIMEOUT = /timeout|timed out|aborted due to|AbortError|ETIMEDOUT/i;
const NETWORK = /ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|fetch failed|socket hang up|network|terminated/i;
const DB = /MongoNetworkError|MongoServerSelectionError|MongooseServerSelectionError|buffering timed out|topology was destroyed|connection .* closed/i;

/** Dice cosa significa un errore del server in parole semplici, e cosa fare. */
export function explainServerError(e: ErrorLike): ErrorExplanation {
  const text = `${e.name} ${e.message}`;
  const during = area(e.route);
  const whileDoing = during ? ` durante ${during}` : '';

  if (DB.test(text)) {
    return {
      kind: 'da-guardare',
      text: `Il database non ha risposto${whileDoing}.`,
      advice: 'Controlla che MongoDB sia raggiungibile e non sovraccarico. Se si ripete, il sito può smettere di funzionare.',
    };
  }
  if (/text index required|index not found|no index|hint provided/i.test(text)) {
    return { kind: 'da-guardare', text: `Manca un indice nel database${whileDoing}: la ricerca non può funzionare senza.`, advice: 'Va creato l’indice (di solito all’avvio del backend). Se il backend è appena stato aggiornato, riavvialo e controlla il log.' };
  }
  if (/MongoServerError|MongoError|MongoBulkWriteError/i.test(text)) {
    return { kind: 'da-guardare', text: `Il database ha rifiutato un’operazione${whileDoing}.`, advice: 'Di solito manca un indice o la richiesta non è valida per quella collezione. Apri lo stack per vedere quale.' };
  }
  if (TIMEOUT.test(text)) {
    return {
      kind: 'passeggero',
      text: `Un servizio esterno ha risposto troppo lentamente${whileDoing}: la richiesta è stata interrotta.`,
      advice: 'Di solito si risolve da solo (la fonte era lenta in quel momento). Se compare spesso, il limite di attesa può essere troppo basso.',
    };
  }
  if (NETWORK.test(text)) {
    return {
      kind: 'passeggero',
      text: `Non è stato possibile collegarsi a un servizio esterno${whileDoing} (rete interrotta o servizio spento).`,
      advice: 'Quasi sempre è un problema momentaneo dell’altro servizio. Preoccupati solo se si ripete per ore.',
    };
  }
  if (/E11000|duplicate key/i.test(text)) {
    return { kind: 'da-guardare', text: `Si è provato a salvare un dato che esiste già${whileDoing}.`, advice: 'Di solito è un doppio invio o un conflitto tra due richieste: controlla il punto del codice che salva.' };
  }
  if (/ValidationError|CastError|BSONError|invalid ObjectId|Cast to .+ failed/i.test(text)) {
    return { kind: 'da-guardare', text: `I dati ricevuti non avevano il formato atteso${whileDoing}.`, advice: 'La richiesta andava rifiutata con un errore 400 invece di arrivare fin qui: è un controllo mancante nel codice.' };
  }
  if (/429|too many requests|rate limit|quota|RESOURCE_EXHAUSTED/i.test(text)) {
    return { kind: 'passeggero', text: `È stato raggiunto un limite di richieste o di utilizzo di un servizio${whileDoing}.`, advice: 'Se riguarda l’AI, controlla la quota giornaliera nella sezione "Consumo AI". Di solito torna normale da solo.' };
  }
  if (/groq|gemini|openai|anthropic|llm|completion/i.test(text)) {
    return { kind: 'passeggero', text: `Il servizio di intelligenza artificiale ha dato errore${whileDoing}.`, advice: 'Il sito usa le risposte di riserva quando succede. Controlla la quota e lo stato del servizio se si ripete.' };
  }
  if (/ENOSPC|no space left/i.test(text)) {
    return { kind: 'da-guardare', text: 'Lo spazio su disco del server è finito.', advice: 'Urgente: libera spazio (log, backup vecchi, file temporanei), altrimenti il sito smette di salvare dati.' };
  }
  if (/ENOMEM|heap out of memory|JavaScript heap/i.test(text)) {
    return { kind: 'da-guardare', text: 'Il server ha finito la memoria.', advice: 'Probabilmente un file o una richiesta troppo grandi. Controlla l’uso di memoria nella sezione "Server e backup".' };
  }
  if (/EACCES|EPERM|permission denied/i.test(text)) {
    return { kind: 'da-guardare', text: 'Il server non ha il permesso di leggere o scrivere un file o una cartella.', advice: 'Controlla i permessi della cartella indicata nello stack.' };
  }
  if (/JsonWebTokenError|TokenExpiredError|jwt/i.test(text)) {
    return { kind: 'passeggero', text: 'Un accesso era scaduto o non valido.', advice: 'Di solito basta rifare il login. Non è un guasto.' };
  }
  if (/Cannot read propert|is not a function|is not defined|undefined|null/i.test(text) && /TypeError|ReferenceError/.test(text)) {
    return { kind: 'da-guardare', text: `Errore nel codice${whileDoing}: un dato mancava dove era atteso.`, advice: 'È un bug da correggere. Apri lo stack ("Mostra stack") per vedere il file e la riga.' };
  }
  if (/SyntaxError|JSON/i.test(text)) {
    return { kind: 'da-guardare', text: `Una risposta o un testo non era leggibile${whileDoing}.`, advice: 'Può essere una risposta non valida di un servizio esterno. Apri lo stack per vedere da dove arriva.' };
  }
  if (e.status === 502 || e.status === 503 || e.status === 504) {
    return { kind: 'passeggero', text: `Il server o un servizio collegato non era disponibile${whileDoing}.`, advice: 'Di solito dura poco. Preoccupati solo se si ripete.' };
  }
  return {
    kind: 'da-guardare',
    text: `Errore non previsto${whileDoing}: il server ha avuto un problema che non riconosco.`,
    advice: 'Apri lo stack ("Mostra stack") per vedere in quale file è successo.',
  };
}
