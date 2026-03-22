import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Otp, OtpDocument } from './schemas/otp.schema';
import { SmsService } from './sms.service';
import { UsersService } from '../users/users.service';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 3;
const REQUEST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<OtpDocument>,
    private smsService: SmsService,
    private usersService: UsersService,
  ) {}

  async requestOtp(phone: string): Promise<{ message: string }> {
    // Rate limiting: max 3 requests per phone per 10 minutes
    const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS);
    const recentCount = await this.otpModel.countDocuments({
      phone,
      createdAt: { $gte: windowStart },
    });

    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn(`OTP rate limit exceeded for phone: ${this.maskPhone(phone)}`);
      throw new HttpException(
        'Too many OTP requests. Please wait before requesting a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any previous unused OTPs for this phone
    await this.otpModel.updateMany(
      { phone, used: false },
      { $set: { used: true } },
    );

    // Generate cryptographically secure 6-digit OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.otpModel.create({ phone, otpHash, expiresAt });

    // Send via SMS (throws on failure)
    try {
      await this.smsService.sendOtp(phone, otpCode);
    } catch (err) {
      this.logger.error(
        `Failed to send OTP SMS to ${this.maskPhone(phone)}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        'Failed to send OTP. Please verify your phone number and try again.',
      );
    }

    this.logger.log(`OTP requested for ${this.maskPhone(phone)}`);
    return { message: 'OTP sent successfully. It will expire in 5 minutes.' };
  }

  async verifyOtp(phone: string, otp: string): Promise<any> {
    const record = await this.otpModel
      .findOne({
        phone,
        used: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      this.logger.warn(`No valid OTP found for ${this.maskPhone(phone)}`);
      throw new UnauthorizedException(
        'OTP is invalid or has expired. Please request a new code.',
      );
    }

    // Increment attempt counter before comparing to prevent timing attacks from bypassing check
    record.attempts += 1;

    if (record.attempts > MAX_VERIFY_ATTEMPTS) {
      record.used = true;
      await record.save();
      this.logger.warn(`Max OTP attempts exceeded for ${this.maskPhone(phone)}`);
      throw new UnauthorizedException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    const isValid = await bcrypt.compare(otp, record.otpHash);

    if (!isValid) {
      await record.save();
      const remaining = MAX_VERIFY_ATTEMPTS - record.attempts;
      this.logger.warn(
        `Invalid OTP for ${this.maskPhone(phone)}, ${remaining} attempts left`,
      );
      throw new UnauthorizedException(
        `Invalid OTP code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    // Mark OTP as used to prevent replay
    record.used = true;
    await record.save();

    const user = await this.usersService.findOrCreateByPhone(phone);
    this.logger.log(
      `OTP verified for ${this.maskPhone(phone)}, user: ${user._id}`,
    );
    return user;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
  }
}
