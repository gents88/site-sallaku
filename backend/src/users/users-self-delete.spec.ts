import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { UsersService } from './users.service';

const OID = '507f1f77bcf86cd799439011';

/** findById(...).select(...).exec() e .select(...).lean().exec(), come li usa UsersService. */
function findChain(value: unknown) {
  const q: Record<string, jest.Mock> = {};
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
}

function makeService(user: Record<string, unknown> | null) {
  const model = {
    findById: jest.fn(() => findChain(user)),
    deleteOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  const sessions = { deleteMany: jest.fn(() => ({ exec: () => Promise.resolve({}) })) };
  const savedResults = { deleteMany: jest.fn(() => ({ exec: () => Promise.resolve({}) })) };
  const service = new UsersService(model as never, sessions as never, savedResults as never);
  return { service, model, sessions, savedResults };
}

describe('UsersService — cancellazione del proprio account', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('Corretta123!', 4);
  });

  it('con la password giusta cancella account, file salvati e sessioni', async () => {
    const { service, model, sessions, savedResults } = makeService({ _id: OID, role: 'user', passwordHash });

    await service.deleteOwnAccount(OID, 'Corretta123!');

    expect(savedResults.deleteMany).toHaveBeenCalledWith({ userId: new Types.ObjectId(OID) });
    expect(model.deleteOne).toHaveBeenCalledWith({ _id: OID });
    expect(sessions.deleteMany).toHaveBeenCalledWith({ userId: new Types.ObjectId(OID) });
  });

  it('con la password sbagliata non cancella nulla', async () => {
    const { service, model, sessions, savedResults } = makeService({ _id: OID, role: 'user', passwordHash });

    await expect(service.deleteOwnAccount(OID, 'Sbagliata123!')).rejects.toBeInstanceOf(BadRequestException);

    expect(savedResults.deleteMany).not.toHaveBeenCalled();
    expect(model.deleteOne).not.toHaveBeenCalled();
    expect(sessions.deleteMany).not.toHaveBeenCalled();
  });

  it('se l\'account ha una password, senza password rifiuta', async () => {
    const { service, model } = makeService({ _id: OID, role: 'user', passwordHash });

    await expect(service.deleteOwnAccount(OID)).rejects.toBeInstanceOf(BadRequestException);
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('un account solo-OTP (senza password) si cancella senza password', async () => {
    const { service, model } = makeService({ _id: OID, role: 'user' });

    await service.deleteOwnAccount(OID);

    expect(model.deleteOne).toHaveBeenCalledWith({ _id: OID });
  });

  it('l\'account admin non si cancella da qui', async () => {
    const { service, model } = makeService({ _id: OID, role: 'admin', passwordHash });

    await expect(service.deleteOwnAccount(OID, 'Corretta123!')).rejects.toBeInstanceOf(ForbiddenException);
    expect(model.deleteOne).not.toHaveBeenCalled();
  });

  it('account inesistente → 404', async () => {
    const { service } = makeService(null);
    await expect(service.deleteOwnAccount(OID, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hasPassword dice se l\'account ha una password, senza restituire l\'hash', async () => {
    await expect(makeService({ _id: OID, passwordHash }).service.hasPassword(OID)).resolves.toBe(true);
    await expect(makeService({ _id: OID }).service.hasPassword(OID)).resolves.toBe(false);
    await expect(makeService(null).service.hasPassword(OID)).resolves.toBe(false);
  });
});
