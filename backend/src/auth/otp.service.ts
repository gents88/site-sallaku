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
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Otp, OtpChannel, OtpDocument } from './schemas/otp.schema';
import { SmsService } from './sms.service';
import { MailService } from '../mail/mail.service';
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
    private mailService: MailService,
    private usersService: UsersService,
  ) {}

  /**
   * Request an OTP via phone (SMS) or email.
   * Exactly one of `phone` or `email` must be provided.
   */
  async requestOtp(
    phone?: string,
    email?: string,
  ): Promise<{ message: string }> {
    const { identifier, channel } = this.resolveChannel(phone, email);

    // Rate limiting: max 3 requests per identifier per 10 minutes
    const windowStart = new Date(Date.now() - REQUEST_WINDOW_MS);
    const recentCount = await this.otpModel.countDocuments({
      identifier,
      createdAt: { $gte: windowStart },
    });

    if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
      this.logger.warn(`OTP rate limit exceeded for: ${this.mask(identifier)}`);
      throw new HttpException(
        'Too many OTP requests. Please wait before requesting a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any previous unused OTPs for this identifier
    await this.otpModel.updateMany(
      { identifier, used: false },
      { $set: { used: true } },
    );

    // Generate cryptographically secure 6-digit OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otpCode, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await this.otpModel.create({ identifier, channel, otpHash, expiresAt });

    // Deliver OTP via the appropriate channel
    try {
      if (channel === 'sms') {
        await this.smsService.sendOtp(identifier, otpCode);
      } else {
        await this.mailService.sendOtpEmail(identifier, otpCode);
      }
    } catch (err) {
      this.logger.error(
        `Failed to send OTP (${channel}) to ${this.mask(identifier)}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        channel === 'sms'
          ? 'Failed to send SMS. Please verify your phone number and try again.'
          : 'Failed to send email. Please verify your email address and try again.',
      );
    }

    this.logger.log(`OTP requested via ${channel} for ${this.mask(identifier)}`);
    return {
      message: `OTP sent successfully via ${channel === 'sms' ? 'SMS' : 'email'}. It will expire in 5 minutes.`,
    };
  }

  /**
   * Verify an OTP and return the associated user.
   * Exactly one of `phone` or `email` must be provided.
   */
  async verifyOtp(phone?: string, email?: string, otp?: string): Promise<any> {
    const { identifier, channel } = this.resolveChannel(phone, email);

    const record = await this.otpModel
      .findOne({
        identifier,
        used: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec();

    if (!record) {
      this.logger.warn(`No valid OTP found for ${this.mask(identifier)}`);
      throw new UnauthorizedException(
        'OTP is invalid or has expired. Please request a new code.',
      );
    }

    // Increment attempt counter before comparing (prevents timing attack bypass)
    record.attempts += 1;

    if (record.attempts > MAX_VERIFY_ATTEMPTS) {
      record.used = true;
      await record.save();
      this.logger.warn(`Max OTP attempts exceeded for ${this.mask(identifier)}`);
      throw new UnauthorizedException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    const isValid = await bcrypt.compare(otp!, record.otpHash);

    if (!isValid) {
      await record.save();
      const remaining = MAX_VERIFY_ATTEMPTS - record.attempts;
      this.logger.warn(
        `Invalid OTP for ${this.mask(identifier)}, ${remaining} attempts left`,
      );
      throw new UnauthorizedException(
        `Invalid OTP code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    // Mark OTP as used to prevent replay attacks
    record.used = true;
    await record.save();

    // Find or create user by the appropriate identifier
    const user =
      channel === 'sms'
        ? await this.usersService.findOrCreateByPhone(identifier)
        : await this.usersService.findOrCreateByEmailOtp(identifier);

    this.logger.log(
      `OTP verified via ${channel} for ${this.mask(identifier)}, user: ${user._id}`,
    );
    return user;
  }

  // ── Helpers ────────────────────────────────────────────────

  private resolveChannel(
    phone?: string,
    email?: string,
  ): { identifier: string; channel: OtpChannel } {
    if (phone) return { identifier: phone.trim(), channel: 'sms' };
    if (email) return { identifier: email.trim().toLowerCase(), channel: 'email' };
    throw new BadRequestException(
      'Provide either a phone number or an email address.',
    );
  }

  private mask(value: string): string {
    if (value.includes('@')) {
      const [local, domain] = value.split('@');
      return `${local.slice(0, 2)}****@${domain}`;
    }
    if (value.length <= 4) return '****';
    return `${value.slice(0, 4)}****${value.slice(-2)}`;
  }
}
