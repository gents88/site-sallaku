import { LiveHandoffSession } from './admin-dashboard.service';

/**
 * Logica della card "Chat live" della dashboard, estratta dal componente per poterla
 * testare sul codice reale: montare DashboardComponent tirerebbe dentro l'intera
 * dashboard (decine di chiamate HTTP e grafici), e un test che ne riscrive la logica
 * a parte non intercetterebbe mai una regressione vera.
 */

/** Sessioni in cui Gent è già entrato: quelle da cui potrebbe essere uscito per sbaglio. */
export function activeLiveHandoffs(sessions: LiveHandoffSession[]): LiveHandoffSession[] {
  return sessions.filter((s) => s.status === 'agent_joining' || s.status === 'live');
}

/** Sessioni in cui un visitatore sta ancora aspettando una risposta. */
export function waitingLiveHandoffs(sessions: LiveHandoffSession[]): LiveHandoffSession[] {
  return sessions.filter((s) => s.status === 'requested' || s.status === 'notified');
}

export function liveHandoffStatusKey(session: LiveHandoffSession): string {
  switch (session.status) {
    case 'live':
      return 'live_handoff.admin_live';
    case 'agent_joining':
      return 'live_handoff.admin_joining';
    default:
      return 'live_handoff.card_waiting';
  }
}

/** La rotta admin è parametrizzata sul sessionId, non sul requestId. */
export function liveHandoffRoute(session: LiveHandoffSession): (string | number)[] {
  return ['/dashboard/live-chat', session.sessionId];
}
