import { NotificationSummary } from '../../../core/services/admin-notifications.service';

/** Un contatore che compone il badge, con l'etichetta letta dagli screen reader. */
export interface NavBadgePart {
  count: number;
  labelKey: string;
}

export interface NavBadge {
  count: number;
  /** Qualcuno sta aspettando adesso (chat live): colore d'allarme. */
  urgent: boolean;
  parts: NavBadgePart[];
}

/**
 * Contatori del campanello (AdminNotificationsService) agganciati alle voci
 * della sidebar, per id del registro. Stesse destinazioni delle righe del
 * campanello: la chat live si prende dalla card della dashboard e i follow-up
 * stanno nella inbox contatti, quindi si sommano ai messaggi da leggere.
 * Le voci a zero non compaiono.
 */
export function navBadges(summary: NotificationSummary): Partial<Record<string, NavBadge>> {
  const spec: { id: string; urgent: boolean; parts: NavBadgePart[] }[] = [
    { id: 'dashboard', urgent: true, parts: [{ count: summary.liveHandoffsWaiting, labelKey: 'notifications.live_waiting' }] },
    {
      id: 'admin-contacts',
      urgent: false,
      parts: [
        { count: summary.contactsUnread, labelKey: 'notifications.contacts_unread' },
        { count: summary.followUpsDue ?? 0, labelKey: 'notifications.followups_due' },
      ],
    },
    { id: 'admin-testimonials', urgent: false, parts: [{ count: summary.testimonialsPending, labelKey: 'notifications.testimonials_pending' }] },
    { id: 'admin-notes', urgent: false, parts: [{ count: summary.notesPending, labelKey: 'notifications.notes_pending' }] },
  ];

  const badges: Partial<Record<string, NavBadge>> = {};
  for (const { id, urgent, parts } of spec) {
    const nonZero = parts.filter(p => p.count > 0);
    const count = nonZero.reduce((total, p) => total + p.count, 0);
    if (count > 0) badges[id] = { count, urgent, parts: nonZero };
  }
  return badges;
}

/** Testo del badge: oltre 99 non serve la cifra esatta e il cerchio non si allarga. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
