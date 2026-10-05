import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PASSWORD_BCRYPT_ROUNDS } from '../auth/password-policy';
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

  /** Creazione da admin: niente OTP di verifica, l'indirizzo lo garantisce l'admin (salvo emailVerified=false). */
  async createByAdmin(dto: { name: string; email: string; phone?: string; role: string; password?: string; emailVerified?: boolean }) {
    await this.assertUnique(dto.email, dto.phone);
    const created = await this.userModel.create({
      name: dto.name.trim(),
      email: dto.email.toLowerCase().trim(),
      ...(dto.phone ? { phone: dto.phone } : {}),
      role: dto.role,
      emailVerified: dto.emailVerified ?? true,
      ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, PASSWORD_BCRYPT_ROUNDS) } : {}),
    });
    return this.toAdminView(created);
  }

  /** Modifica del profilo. Il ruolo resta su updateRole (protezioni su sé stessi e ultimo admin). */
  async updateByAdmin(targetId: string, dto: { name?: string; email?: string; phone?: string; emailVerified?: boolean }) {
    const user = await this.userModel.findById(targetId).exec();
    if (!user) throw new NotFoundException(`User #${targetId} not found`);
    const email = dto.email?.toLowerCase().trim();
    await this.assertUnique(email !== user.email ? email : undefined, dto.phone && dto.phone !== user.phone ? dto.phone : undefined, targetId);

    if (dto.name !== undefined) user.name = dto.name.trim();
    if (email !== undefined) user.email = email;
    if (dto.phone !== undefined) user.phone = dto.phone === '' ? undefined : dto.phone;
    if (dto.emailVerified !== undefined) user.emailVerified = dto.emailVerified;
    await user.save();
    return this.toAdminView(user);
  }

  /** Nuova password scelta dall'admin; chiude anche tutte le sessioni dell'utente. */
  async setPasswordByAdmin(targetId: string, password: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_ROUNDS);
    const res = await this.userModel.updateOne({ _id: targetId }, { $set: { passwordHash, refreshTokenHash: null } }).exec();
    if (!res.matchedCount) throw new NotFoundException(`User #${targetId} not found`);
  }

  /** Disconnette l'utente ovunque: il refresh token non vale più (l'access token scade da solo). */
  async revokeSessions(actorId: string, targetId: string): Promise<void> {
    if (actorId === targetId) throw new BadRequestException('Use logout to end your own session');
    const res = await this.userModel.updateOne({ _id: targetId }, { $set: { refreshTokenHash: null } }).exec();
    if (!res.matchedCount) throw new NotFoundException(`User #${targetId} not found`);
  }

  private async assertUnique(email?: string, phone?: string, exceptId?: string): Promise<void> {
    const or: Record<string, string>[] = [];
    if (email) or.push({ email: email.toLowerCase().trim() });
    if (phone) or.push({ phone });
    if (!or.length) return;
    const filter: Record<string, unknown> = { $or: or };
    if (exceptId) filter._id = { $ne: exceptId };
    if (await this.userModel.exists(filter)) throw new ConflictException('Email or phone already in use');
  }

  private toAdminView(u: UserDocument) {
    return { _id: String(u._id), name: u.name, email: u.email ?? null, phone: u.phone ?? null, role: u.role, emailVerified: u.emailVerified, createdAt: (u as unknown as { createdAt?: Date }).createdAt };
  }

  private async assertNotLastAdmin(): Promise<void> {
    const admins = await this.userModel.countDocuments({ role: 'admin' }).exec();
    if (admins <= 1) throw new BadRequestException('At least one admin must remain');
  }
}

