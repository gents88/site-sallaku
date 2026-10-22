import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactMessage, ContactMessageDocument } from '../contact/schemas/contact-message.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Post, PostDocument } from '../blog/schemas/post.schema';
import { Note, NoteDocument } from '../notes/schemas/note.schema';
import { escapeRegex } from '../common/utils/escape-regex';

export type AdminSearchHitType = 'contact' | 'user' | 'draft' | 'note';

export interface AdminSearchHit {
  id: string;
  type: AdminSearchHitType;
  title: string;
  /** Riga secondaria: oggetto, ruolo, lingua o estratto. */
  detail: string;
  /** Pagina admin che mostra l'elemento (path logico, senza prefisso lingua). */
  url: string;
}

export const ADMIN_SEARCH_PER_TYPE = 4;
const EXCERPT_MAX = 90;

const excerpt = (text: string | undefined): string => {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
};

/**
 * Ricerca trasversale per la palette Ctrl+K dell'admin: contatti, utenti,
 * bozze e note in un'unica chiamata. Ogni sorgente ha il suo limite così una
 * sola non riempie l'elenco. I risultati sono solo puntatori: la pagina di
 * destinazione rilegge l'elemento (e applica da sé permessi e dettagli).
 */
@Injectable()
export class AdminSearchService {
  constructor(
    @InjectModel(ContactMessage.name) private readonly contacts: Model<ContactMessageDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(Note.name) private readonly notes: Model<NoteDocument>,
  ) {}

  async search(rawQuery: string): Promise<AdminSearchHit[]> {
    const q = rawQuery.trim();
    if (q.length < 2) return [];
    const rx = new RegExp(escapeRegex(q), 'i');

    // Una sorgente che fallisce non deve far sparire le altre.
    const settled = await Promise.allSettled([
      this.searchContacts(rx),
      this.searchUsers(rx),
      this.searchDrafts(rx),
      this.searchNotes(rx),
    ]);
    return settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  }

  private async searchContacts(rx: RegExp): Promise<AdminSearchHit[]> {
    const rows = await this.contacts
      .find({ $or: [{ name: rx }, { email: rx }, { subject: rx }, { message: rx }] })
      .select('name email subject')
      .sort({ createdAt: -1 })
      .limit(ADMIN_SEARCH_PER_TYPE)
      .lean()
      .exec();
    return rows.map(c => ({
      id: `contact:${c._id}`,
      type: 'contact' as const,
      title: c.name,
      detail: excerpt(`${c.subject} · ${c.email}`),
      url: `/dashboard/contacts?q=${encodeURIComponent(c.email)}`,
    }));
  }

  private async searchUsers(rx: RegExp): Promise<AdminSearchHit[]> {
    const rows = await this.users
      .find({ $or: [{ name: rx }, { email: rx }, { phone: rx }] })
      .select('name email phone role')
      .sort({ createdAt: -1 })
      .limit(ADMIN_SEARCH_PER_TYPE)
      .lean()
      .exec();
    return rows.map(u => {
      const handle = u.email ?? u.phone ?? u.name;
      return {
        id: `user:${u._id}`,
        type: 'user' as const,
        title: u.name,
        detail: excerpt(`${u.role} · ${handle}`),
        url: `/dashboard/users?q=${encodeURIComponent(handle)}`,
      };
    });
  }

  private async searchDrafts(rx: RegExp): Promise<AdminSearchHit[]> {
    const rows = await this.posts
      .find({ published: false, $or: [{ title: rx }, { slug: rx }] })
      .select('title language scheduledAt')
      .sort({ updatedAt: -1 })
      .limit(ADMIN_SEARCH_PER_TYPE)
      .lean()
      .exec();
    return rows.map(p => ({
      id: `draft:${p._id}`,
      type: 'draft' as const,
      title: p.title,
      detail: `${(p.language ?? 'it').toUpperCase()}${p.scheduledAt ? ' · programmato' : ' · bozza'}`,
      url: `/dashboard/blog?edit=${p._id}`,
    }));
  }

  private async searchNotes(rx: RegExp): Promise<AdminSearchHit[]> {
    const rows = await this.notes
      .find({ $or: [{ content: rx }, { name: rx }, { email: rx }] })
      .select('content name isApproved isSpam')
      .sort({ createdAt: -1 })
      .limit(ADMIN_SEARCH_PER_TYPE)
      .lean()
      .exec();
    return rows.map(n => ({
      id: `note:${n._id}`,
      type: 'note' as const,
      title: n.name?.trim() || 'Anonimo',
      detail: excerpt(n.content),
      // Apre la scheda in cui la nota si trova davvero.
      url: `/dashboard/notes?status=${n.isSpam ? 'spam' : n.isApproved ? 'approved' : 'pending'}`,
    }));
  }
}
