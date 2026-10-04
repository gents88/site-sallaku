import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';

function chain<T>(value: T) {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'skip', 'limit', 'lean']) q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
}

function makeService(opts: { target?: Record<string, unknown> | null; adminCount?: number } = {}) {
  const target = opts.target === undefined ? { _id: 't1', role: 'admin', refreshTokenHash: 'h', save: jest.fn() } : opts.target;
  const model = {
    find: jest.fn(() => chain([{ name: 'A' }])),
    countDocuments: jest.fn((filter: Record<string, unknown>) => ({
      exec: () => Promise.resolve(filter?.role === 'admin' ? (opts.adminCount ?? 2) : 1),
    })),
    findById: jest.fn(() => ({ exec: () => Promise.resolve(target) })),
    deleteOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  return { service: new UsersService(model as never), model, target };
}

describe('UsersService (admin management)', () => {
  it('lists users with only safe fields and an escaped, case-insensitive search', async () => {
    const { service, model } = makeService();
    const res = await service.findPaginated({ page: 1, limit: 20, q: 'a.b(', role: 'user' });
    const [filter, projection] = model.find.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, number>];
    expect(projection).toEqual({ name: 1, email: 1, phone: 1, role: 1, emailVerified: 1, createdAt: 1 });
    expect(filter.role).toBe('user');
    const re = (filter.$or as Array<{ name: RegExp }>)[0].name;
    expect(re.source).toBe('a\\.b\\(');
    expect(re.flags).toBe('i');
    expect(res).toMatchObject({ total: 1, page: 1, totalPages: 1 });
  });

  it('refuses to change your own role', async () => {
    const { service } = makeService();
    await expect(service.updateRole('me', 'me', 'user')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to demote the last admin', async () => {
    const { service, target } = makeService({ adminCount: 1 });
    await expect(service.updateRole('me', 't1', 'user')).rejects.toBeInstanceOf(BadRequestException);
    expect((target as { save: jest.Mock }).save).not.toHaveBeenCalled();
  });

  it('changes the role and revokes the refresh token', async () => {
    const { service, target } = makeService({ adminCount: 2 });
    await expect(service.updateRole('me', 't1', 'user')).resolves.toEqual({ _id: 't1', role: 'user' });
    expect(target).toMatchObject({ role: 'user', refreshTokenHash: null });
  });

  it('404s on an unknown user', async () => {
    const { service } = makeService({ target: null });
    await expect(service.updateRole('me', 'x', 'admin')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeByAdmin('me', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to delete yourself or the last admin, deletes otherwise', async () => {
    await expect(makeService().service.removeByAdmin('me', 'me')).rejects.toBeInstanceOf(BadRequestException);
    await expect(makeService({ adminCount: 1 }).service.removeByAdmin('me', 't1')).rejects.toBeInstanceOf(BadRequestException);
    const { service, model } = makeService({ target: { _id: 'u2', role: 'user' } });
    await service.removeByAdmin('me', 'u2');
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: 'u2' });
  });
});

describe('ParseMongoIdPipe', () => {
  it('accepts an ObjectId and rejects anything else with 400', () => {
    const pipe = new ParseMongoIdPipe();
    expect(pipe.transform('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    expect(() => pipe.transform('not-an-id')).toThrow(BadRequestException);
  });
});
