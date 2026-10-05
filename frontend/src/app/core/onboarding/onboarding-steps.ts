import type { Alignment, Side } from 'driver.js';

/**
 * Configurazione dichiarativa degli step del tour di onboarding.
 *
 * Ogni step elenca più selettori candidati in `targets`, in ordine di
 * preferenza: il servizio evidenzia il primo che esiste ed è visibile.
 * È così che lo stesso step si adatta al layout — sopra i 1200px la sidebar
 * è una rail agganciata (`#app-sidebar.is-rail`), tra 901 e 1199px c'è il
 * trigger in navbar, sotto i 900px la bottom tab bar. Se nessun candidato è
 * visibile lo step diventa un popover centrato senza spotlight: il testo
 * resta utile anche quando l'elemento non è a schermo.
 */
export interface OnboardingStepDef {
  id: string;
  /** Chiavi i18n sotto `onboarding.steps.<id>`. */
  titleKey: string;
  bodyKey: string;
  /** Selettori candidati; assente/vuoto = popover centrato. */
  targets?: string[];
  side?: Side;
  align?: Alignment;
}

/** Gruppi della sidebar pubblica, ciascuno spiegato con uno step dedicato. */
const SIDEBAR_GROUP_IDS = ['ai', 'workspace', 'account', 'tools'] as const;

const step = (id: string, extra: Omit<OnboardingStepDef, 'id' | 'titleKey' | 'bodyKey'> = {}): OnboardingStepDef => ({
  id,
  titleKey: `onboarding.steps.${id}.title`,
  bodyKey: `onboarding.steps.${id}.body`,
  ...extra,
});

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  // 1. Benvenuto: nessuno spotlight, introduce il tour.
  step('welcome'),

  // 2. Navigazione: rail su desktop, trigger del drawer su tablet, tab bar su mobile.
  step('navigation', {
    targets: ['#app-sidebar.is-rail', '.nav-drawer-toggle', '.bottom-tabbar'],
    side: 'right',
    align: 'start',
  }),

  // 3–6. Una voce per gruppo della sidebar. Il marcatore data-tour-group è
  // sul template della sidebar; su mobile il drawer è fuori schermo, quindi
  // questi step ricadono nel popover centrato con la sola spiegazione.
  ...SIDEBAR_GROUP_IDS.map(group =>
    step(`group_${group}`, {
      targets: [`#app-sidebar.is-rail [data-tour-group="${group}"]`],
      side: 'right',
      align: 'start',
    }),
  ),

  // 7. Area centrale: la prima <section> della pagina corrente (sulla home
  // è l'hero); su pagine senza section si ripiega su <main>.
  step('main', {
    targets: ['#main-content section', '#main-content'],
    side: 'bottom',
    align: 'center',
  }),

  // 8. Chatbot: il pulsante flottante in basso a destra.
  step('chatbot', {
    targets: ['.cb-fab'],
    side: 'top',
    align: 'end',
  }),

  // 9. Chiusura: ricorda dove riaprire la guida.
  step('finish'),
];
