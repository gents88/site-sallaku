import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';

/** Builds a chainable mongoose query mock, e.g. `.select().exec()` or just `.exec()`. */
function queryMock(resolvedValue: unknown) {
  const exec = jest.fn().mockResolvedValue(resolvedValue);
  const select = jest.fn().mockReturnValue({ exec });
  return { exec, select };
}

describe('UsersService', () => {
  let service: UsersService;
  let userModel: any;

  beforeEach(async () => {
    userModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: getModelToken(User.name), useValue: userModel }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByEmail', () => {
    it('lowercases the email and includes the passwordHash field', async () => {
      const q = queryMock({ _id: '1', email: 'a@b.com' });
      userModel.findOne.mockReturnValue(q);

      await service.findByEmail('A@B.COM');

      expect(userModel.findOne).toHaveBeenCalledWith({ email: 'a@b.com' });
      expect(q.select).toHaveBeenCalledWith('+passwordHash');
    });
  });

  describe('findOrCreateByPhone', () => {
    it('returns the existing user without creating a new one', async () => {
      const existing = { _id: '1', phone: '+123' };
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(existing) });

      const result = await service.findOrCreateByPhone('+123');

      expect(result).toBe(existing);
      expect(userModel.create).not.toHaveBeenCalled();
    });

    it('creates a new "user" role account with a name derived from the phone when none exists', async () => {
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      userModel.create.mockResolvedValue({ _id: 'new-1' });

      await service.findOrCreateByPhone('+15551234567');

      expect(userModel.create).toHaveBeenCalledWith({
        name: 'User 4567',
        phone: '+15551234567',
        role: 'user',
      });
    });
  });

  describe('findOrCreateByEmailOtp', () => {
    it('normalizes email case and never sets a passwordHash', async () => {
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      userModel.create.mockResolvedValue({ _id: 'new-1' });

      await service.findOrCreateByEmailOtp('Test@Example.com');

      expect(userModel.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      const createArg = userModel.create.mock.calls[0][0];
      expect(createArg).toEqual({ name: 'test', email: 'test@example.com', role: 'user' });
      expect(createArg).not.toHaveProperty('passwordHash');
    });
  });

  describe('upsertAdmin', () => {
    it('forces role to admin regardless of input and normalizes the email', async () => {
      const q = queryMock({ _id: '1', role: 'admin' });
      userModel.findOneAndUpdate.mockReturnValue(q);

      await service.upsertAdmin({
        email: 'Admin@Example.com',
        name: 'Admin',
        passwordHash: 'hashed',
        role: 'user' as any,
      });

      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        { email: 'admin@example.com' },
        {
          $set: {
            name: 'Admin',
            email: 'admin@example.com',
            passwordHash: 'hashed',
            role: 'admin',
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      expect(q.select).toHaveBeenCalledWith('+passwordHash');
    });
  });

  describe('saveRefreshToken', () => {
    it('persists the hash for the given user id', async () => {
      userModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });

      await service.saveRefreshToken('user-1', 'hashed-token');

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user-1', { refreshTokenHash: 'hashed-token' });
    });

    it('allows passing null to revoke the refresh token', async () => {
      userModel.findByIdAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(undefined) });

      await service.saveRefreshToken('user-1', null);

      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('user-1', { refreshTokenHash: null });
    });
  });

  describe('findById', () => {
    it('returns null when the user does not exist', async () => {
      userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.findById('missing');

      expect(result).toBeNull();
    });
  });
});
