import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ADMIN_SEARCH_PER_TYPE, AdminSearchService } from './admin-search.service';
import { ContactMessage } from '../contact/schemas/contact-message.schema';
import { User } from '../users/schemas/user.schema';
import { Post } from '../blog/schemas/post.schema';
import { Note } from '../notes/schemas/note.schema';

/** Model finto: find().select().sort().limit().lean().exec() → rows. */
function model(rows: unknown[] | Error) {
  const chain: Record<string, jest.Mock> = {};
  for (const m of ['select', 'sort', 'limit', 'lean']) chain[m] = jest.fn(() => chain);
  chain.exec = jest.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)));
  return { find: jest.fn(() => chain), chain };
}

async function setup(rows: { contacts?: any; users?: any; posts?: any; notes?: any } = {}) {
  const models = {
    contacts: model(rows.contacts ?? []),
    users: model(rows.users ?? []),
    posts: model(rows.posts ?? []),
    notes: model(rows.notes ?? []),
  };
  const mod = await Test.createTestingModule({
    providers: [
      AdminSearchService,
      { provide: getModelToken(ContactMessage.name), useValue: models.contacts },
      { provide: getModelToken(User.name), useValue: models.users },
      { provide: getModelToken(Post.name), useValue: models.posts },
      { provide: getModelToken(Note.name), useValue: models.notes },
    ],
  }).compile();
  return { service: mod.get(AdminSearchService), models };
}

describe('AdminSearchService', () => {
  it('sotto i 2 caratteri non interroga il database', async () => {
    const { service, models } = await setup();
    expect(await service.search(' a ')).toEqual([]);
    expect(models.contacts.find).not.toHaveBeenCalled();
  });

  it('cerca le bozze solo tra gli articoli non pubblicati', async () => {
    const { service, models } = await setup();
    await service.search('guida');
    expect(models.posts.find).toHaveBeenCalledWith(expect.objectContaining({ published: false }));
  });

  it('usa il testo come testo, non come espressione regolare', async () => {
    const { service, models } = await setup();
    await service.search('a.*(b');
    const filter = (models.contacts.find.mock.calls as unknown as unknown[][])[0][0] as { $or: Array<Record<string, RegExp>> };
    const rx = filter.$or[0].name;
    expect(rx.test('a.*(b')).toBe(true);
    expect(rx.test('axxxb')).toBe(false);
  });

  it('limita ogni sorgente così una sola non riempie la lista', async () => {
    const { service, models } = await setup();
    await service.search('mario');
    expect(models.users.chain.limit).toHaveBeenCalledWith(ADMIN_SEARCH_PER_TYPE);
  });

  it('mappa i risultati sulle pagine admin che li aprono', async () => {
    const { service } = await setup({
      contacts: [{ _id: 'c1', name: 'Mario Rossi', email: 'mario@x.it', subject: 'Preventivo' }],
      users: [{ _id: 'u1', name: 'Anna', email: 'anna@x.it', role: 'user' }],
      posts: [{ _id: 'p1', title: 'Bozza SEO', language: 'it', scheduledAt: null }],
      notes: [{ _id: 'n1', name: '', content: 'Bell\'articolo', isApproved: false, isSpam: false }],
    });
    const hits = await service.search('ma');
    expect(hits.map(h => [h.type, h.url])).toEqual([
      ['contact', '/dashboard/contacts?q=mario%40x.it'],
      ['user', '/dashboard/users?q=anna%40x.it'],
      ['draft', '/dashboard/blog?edit=p1'],
      ['note', '/dashboard/notes?status=pending'],
    ]);
    expect(hits[3].title).toBe('Anonimo');
    expect(hits[2].detail).toBe('IT · bozza');
  });

  it('una nota di spam rimanda alla scheda spam, una approvata a quella approvate', async () => {
    const { service } = await setup({
      notes: [
        { _id: 'n1', content: 'x', isApproved: false, isSpam: true },
        { _id: 'n2', content: 'y', isApproved: true, isSpam: false },
      ],
    });
    const urls = (await service.search('xy')).map(h => h.url);
    expect(urls).toEqual(['/dashboard/notes?status=spam', '/dashboard/notes?status=approved']);
  });

  it('una sorgente che fallisce non fa sparire le altre', async () => {
    const { service } = await setup({
      contacts: new Error('boom'),
      posts: [{ _id: 'p1', title: 'Bozza', language: 'en', scheduledAt: new Date() }],
    });
    const hits = await service.search('bozza');
    expect(hits.map(h => h.type)).toEqual(['draft']);
    expect(hits[0].detail).toBe('EN · programmato');
  });
});
