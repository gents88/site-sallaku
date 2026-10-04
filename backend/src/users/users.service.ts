import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { escapeRegex } from '../common/utils/escape-regex';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  }

  async findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone }).exec();
  }

  /** Finds an existing user by phone or creates a new one with role 'user'. */
  async findOrCreateByPhone(phone: string): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ phone }).exec();
    if (existing) return existing;

    return this.userModel.create({
      name: `User ${phone.slice(-4)}`,
      phone,
      role: 'user',
    });
  }

  /**
   * Finds an existing user by email (OTP path — no password required)
   * or creates a new one. Does NOT select passwordHash.
   */
  async findOrCreateByEmailOtp(email: string): Promise<UserDocument> {
    const normalized = email.toLowerCase();
    const existing = await this.userModel.findOne({ email: normalized }).exec();
    if (existing) return existing;

    return this.userModel.create({
      name: normalized.split('@')[0],
      email: normalized,
      role: 'user',
    });
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /** Returns the user with refreshTokenHash included (for verification). */
  async findByIdWithRefreshToken(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select('+refreshTokenHash').exec();
  }

  /** Persist the hashed refresh token for a given user. Pass null to revoke. */
  async saveRefreshToken(userId: string, hash: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshTokenHash: hash }).exec();
  }

  /** Marks an account's email as verified — call only after proving ownership (e.g. a successful email OTP check). */
  async markEmailVerified(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { emailVerified: true }).exec();
  }

  async upsertAdmin(data: Partial<User> & { email: string; passwordHash: string }): Promise<UserDocument> {
    return this.userModel.findOneAndUpdate(
      { email: data.email.toLowerCase() },
      {
        $set: {
          name: data.name,
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          role: 'admin',
          // The bootstrapped admin is provisioned from trusted server-side
          // env vars, not a public form — there's no ownership to prove.
          emailVerified: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('+passwordHash').exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  // ── Gestione utenti (admin) ─────────────────────────────────────────────

  /** Elenco paginato senza campi sensibili (passwordHash/refreshTokenHash sono select:false). */
  async findPaginated(opts: { page: number; limit: number; q?: string; role?: string }) {
    const safeLimit = Math.min(Math.max(opts.limit, 1), 100);
    const page = Math.max(opts.page, 1);
    const filter: Record<string, unknown> = {};
    if (opts.role) filter.role = opts.role;
    const q = opts.q?.trim();
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const [data, total] = await Promise.all([
      this.userModel
        .find(filter, { name: 1, email: 1, phone: 1, role: 1, emailVerified: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .skip((page - 1) * safeLimit)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / safeLimit) };
  }

  /**
   * Cambio ruolo. Vietato su sé stessi (un admin non può togliersi i
   * permessi per errore) e sull'ultimo admin rimasto.
   */
  async updateRole(actorId: string, targetId: string, role: string): Promise<{ _id: string; role: string }> {
    if (actorId === targetId) throw new BadRequestException('You cannot change your own role');
    const target = await this.userModel.findById(targetId).exec();
    if (!target) throw new NotFoundException(`User #${targetId} not found`);
    if (target.role === 'admin' && role !== 'admin') await this.assertNotLastAdmin();

    target.role = role;
    // JwtStrategy rilegge il ruolo dal DB a ogni richiesta, quindi vale subito;
    // si revoca anche il refresh token per chiudere le sessioni aperte.
    target.refreshTokenHash = null;
    await target.save();
    return { _id: String(target._id), role: target.role };
  }

  /** Eliminazione. Stesse protezioni del cambio ruolo. */
  async removeByAdmin(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw new BadRequestException('You cannot delete your own account');
    const target = await this.userModel.findById(targetId).exec();
    if (!target) throw new NotFoundException(`User #${targetId} not found`);
    if (target.role === 'admin') await this.assertNotLastAdmin();
    await this.userModel.deleteOne({ _id: targetId }).exec();
  }

  private async assertNotLastAdmin(): Promise<void> {
    const admins = await this.userModel.countDocuments({ role: 'admin' }).exec();
    if (admins <= 1) throw new BadRequestException('At least one admin must remain');
  }
}

