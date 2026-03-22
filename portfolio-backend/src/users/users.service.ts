import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

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

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
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
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('+passwordHash').exec();
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }
}

