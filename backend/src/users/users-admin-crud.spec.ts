import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { CreateUserDto, SetPasswordDto, UpdateUserDto } from './dto/users-admin.dto';

function setup(opts: { exists?: boolean; target?: Record<string, unknown> | null; matched?: number } = {}) {
  const target = opts.target === undefined ? { _id: 'u1', name: 'Anna', email: 'a@x.it', role: 'user', emailVerified: false, save: jest.fn() } : opts.target;
  const model = {
    exists: jest.fn().mockResolvedValue(opts.exists ? { _id: 'other' } : null),
    create: jest.fn(async (d: Record<string, unknown>) => ({ _id: 'new', createdAt: new Date(), ...d })),
    findById: jest.fn(() => ({ exec: async () => target })),
    updateOne: jest.fn(() => ({ exec: async () => ({ matchedCount: opts.matched ?? 1 }) })),
  };
  const sessions = { deleteMany: jest.fn(() => ({ exec: async () => ({}) })) };
  return { service: new UsersService(model as never, sessions as never), model, target, sessions };
}

const OID = '507f1f77bcf86cd799439011';

describe('UsersService — admin CRUD', () => {
  it('creates a verified user with a bcrypt-hashed password and never returns the hash', async () => {
    const { service, model } = setup();
    const out = await service.createByAdmin({ name: ' Marco ', email: 'Marco@X.it', role: 'user', password: 'Secret#123' });
    const saved = model.create.mock.calls[0][0] as Record<string, string | boolean>;
    expect(saved).toMatchObject({ name: 'Marco', email: 'marco@x.it', role: 'user', emailVerified: true });
    expect(await bcrypt.compare('Secret#123', saved.passwordHash as string)).toBe(true);
    expect(out).not.toHaveProperty('passwordHash');
    expect(out).toMatchObject({ _id: 'new', email: 'marco@x.it' });
  });

  it('creates a passwordless user (OTP login) when no password is given', async () => {
    const { service, model } = setup();
    await service.createByAdmin({ name: 'Otp', email: 'o@x.it', role: 'user' });
    expect(model.create.mock.calls[0][0]).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email or phone with 409', async () => {
    const { service } = setup({ exists: true });
    await expect(service.createByAdmin({ name: 'X', email: 'a@x.it', role: 'user' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates profile fields, clears the phone on empty string, and checks uniqueness excluding itself', async () => {
    const { service, model, target } = setup({ target: { _id: 'u1', name: 'Anna', email: 'a@x.it', phone: '+391', role: 'user', emailVerified: false, save: jest.fn() } });
    await service.updateByAdmin('u1', { name: 'Anna B', email: 'anna@x.it', phone: '', emailVerified: true });
    expect(target).toMatchObject({ name: 'Anna B', email: 'anna@x.it', phone: undefined, emailVerified: true });
    expect(model.exists).toHaveBeenCalledWith({ $or: [{ email: 'anna@x.it' }], _id: { $ne: 'u1' } });
  });

  it('404s when editing a missing user', async () => {
    await expect(setup({ target: null }).service.updateByAdmin('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sets a new password and ends the user sessions', async () => {
    const { service, model } = setup();
    await service.setPasswordByAdmin('u1', 'Another#456');
    const [, update] = model.updateOne.mock.calls[0] as unknown as [unknown, { $set: { passwordHash: string; refreshTokenHash: null } }];
    expect(update.$set.refreshTokenHash).toBeNull();
    expect(await bcrypt.compare('Another#456', update.$set.passwordHash)).toBe(true);
  });

  describe('password degli admin: almeno 12 caratteri', () => {
    it('rifiuta di creare un admin con una password corta, senza creare nulla', async () => {
      const { service, model } = setup();

      await expect(
        service.createByAdmin({ name: 'A', email: 'a@x.it', role: 'admin', password: 'Short#1234' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(model.create).not.toHaveBeenCalled();
    });

    it('accetta un admin con una password di 12 caratteri', async () => {
      const { service, model } = setup();

      await service.createByAdmin({ name: 'A', email: 'a@x.it', role: 'admin', password: 'Twelve#Chars' });

      expect(model.create).toHaveBeenCalled();
    });

    it('un utente normale può continuare ad avere 8 caratteri', async () => {
      const { service, model } = setup();

      await service.createByAdmin({ name: 'U', email: 'u@x.it', role: 'user', password: 'Short#12' });

      expect(model.create).toHaveBeenCalled();
    });

    it('un admin senza password (accesso via OTP) non è toccato dalla regola', async () => {
      const { service, model } = setup();

      await service.createByAdmin({ name: 'A', email: 'a@x.it', role: 'admin' });

      expect(model.create).toHaveBeenCalled();
    });

    it('rifiuta una password corta impostata su un admin esistente e non la salva', async () => {
      const { service, model } = setup({ target: { _id: 'a1', role: 'admin' } });

      await expect(service.setPasswordByAdmin('a1', 'Short#1234')).rejects.toBeInstanceOf(BadRequestException);
      expect(model.updateOne).not.toHaveBeenCalled();
    });

    it('accetta una password lunga su un admin esistente', async () => {
      const { service, model } = setup({ target: { _id: 'a1', role: 'admin' } });

      await service.setPasswordByAdmin('a1', 'Twelve#Chars');

      expect(model.updateOne).toHaveBeenCalled();
    });

    it('su un utente normale la password di 8 caratteri resta valida', async () => {
      const { service, model } = setup();

      await service.setPasswordByAdmin('u1', 'Short#12');

      expect(model.updateOne).toHaveBeenCalled();
    });
  });

  describe('chiusura delle sessioni su tutti i dispositivi', () => {
    it('una nuova password impostata dall’admin disconnette l’utente ovunque', async () => {
      const { service, sessions } = setup();
      await service.setPasswordByAdmin(OID, 'Another#456');
      expect(String((sessions.deleteMany.mock.calls as any)[0][0].userId)).toBe(OID);
    });

    it('la revoca dell’admin chiude tutte le sessioni dell’utente', async () => {
      const { service, sessions } = setup();
      await service.revokeSessions('admin', OID);
      expect(String((sessions.deleteMany.mock.calls as any)[0][0].userId)).toBe(OID);
    });

    it('una revoca su un utente inesistente o su sé stessi non cancella nulla', async () => {
      const { service, sessions } = setup({ matched: 0 });
      await expect(service.revokeSessions('admin', OID)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.revokeSessions(OID, OID)).rejects.toBeInstanceOf(BadRequestException);
      expect(sessions.deleteMany).not.toHaveBeenCalled();
    });
  });

  it('revokes sessions of another user but refuses on yourself', async () => {
    const { service, model } = setup();
    await service.revokeSessions('admin', 'u1');
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 'u1' }, { $set: { refreshTokenHash: null } });
    await expect(service.revokeSessions('admin', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ matched: 0 }).service.revokeSessions('admin', 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('admin user DTO validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const v = (metatype: new () => object, value: unknown) => pipe.transform(value, { type: 'body', metatype });

  it('enforces the same password policy as registration', async () => {
    await expect(v(SetPasswordDto, { password: 'weakpass' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(v(SetPasswordDto, { password: 'Strong#123' })).resolves.toBeDefined();
  });

  it('validates role, email and E.164 phone on create, and refuses unknown fields like passwordHash', async () => {
    await expect(v(CreateUserDto, { name: 'A', email: 'a@x.it', role: 'admin', phone: '+393331234567' })).resolves.toBeDefined();
    await expect(v(CreateUserDto, { name: 'A', email: 'a@x.it', role: 'superuser' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(v(CreateUserDto, { name: 'A', email: 'a@x.it', role: 'user', phone: '333' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(v(CreateUserDto, { name: 'A', email: 'a@x.it', role: 'user', passwordHash: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow changing the role through the profile update', async () => {
    await expect(v(UpdateUserDto, { role: 'admin' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(v(UpdateUserDto, { phone: '' })).resolves.toBeDefined();
  });
});
