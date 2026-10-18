import { describe, expect, it } from 'vitest';
import { badgeText, navBadges } from './nav-badges';
import { NAV_REGISTRY } from '../../../core/navigation/nav-registry';

const ZERO = { contactsUnread: 0, testimonialsPending: 0, notesPending: 0, liveHandoffsWaiting: 0 };

describe('navBadges', () => {
  it('non produce badge quando non c\'è niente in attesa', () => {
    expect(navBadges(ZERO)).toEqual({});
    expect(navBadges({ ...ZERO, followUpsDue: 0 })).toEqual({});
  });

  it('somma messaggi da leggere e follow-up sulla voce Contatti, elencando solo le parti non a zero', () => {
    expect(navBadges({ ...ZERO, contactsUnread: 2, followUpsDue: 1 })['admin-contacts']).toEqual({
      count: 3,
      urgent: false,
      parts: [
        { count: 2, labelKey: 'notifications.contacts_unread' },
        { count: 1, labelKey: 'notifications.followups_due' },
      ],
    });
    expect(navBadges({ ...ZERO, followUpsDue: 4 })['admin-contacts']?.parts).toEqual([
      { count: 4, labelKey: 'notifications.followups_due' },
    ]);
  });

  it('tollera un backend precedente senza followUpsDue', () => {
    expect(navBadges({ ...ZERO, contactsUnread: 1 })['admin-contacts']?.count).toBe(1);
  });

  it('segna come urgente solo la chat live in attesa, sulla Dashboard', () => {
    const badges = navBadges({ ...ZERO, liveHandoffsWaiting: 1, testimonialsPending: 2, notesPending: 5 });
    expect(badges['dashboard']).toMatchObject({ count: 1, urgent: true });
    expect(badges['admin-testimonials']).toMatchObject({ count: 2, urgent: false });
    expect(badges['admin-notes']).toMatchObject({ count: 5, urgent: false });
  });

  it('usa solo id che esistono nel registro come voci della sidebar', () => {
    const all = navBadges({ contactsUnread: 1, testimonialsPending: 1, notesPending: 1, liveHandoffsWaiting: 1, followUpsDue: 1 });
    const sidebarIds = new Set(NAV_REGISTRY.filter(e => e.sidebar).map(e => e.id));
    expect(Object.keys(all).length).toBe(4);
    for (const id of Object.keys(all)) expect(sidebarIds.has(id)).toBe(true);
  });
});

describe('badgeText', () => {
  it('mostra il numero fino a 99 e "99+" oltre', () => {
    expect(badgeText(7)).toBe('7');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});
