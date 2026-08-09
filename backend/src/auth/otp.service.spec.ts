import { BadRequestException, HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { OtpService } from './otp.service';
import { Otp } from './schemas/otp.schema';
import { SmsService } from './sms.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';

describe('OtpService', () => {
  let service: OtpService;
  let otpModel: any;
  let smsService: jest.Mocked<SmsService>;
  let mailService: jest.Mocked<MailService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    otpModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
    };
    smsService = { sendOtp: jest.fn().mockResolvedValue(undefined) } as any;
    mailService = { sendOtpEmail: jest.fn().mockResolvedValue(undefined) } as any;
    usersService = {
      findOrCreateByPhone: jest.fn(),
      findOrCreateByEmailOtp: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getModelToken(Otp.name), useValue: otpModel },
        { provide: SmsService, useValue: smsService },
        { provide: MailService, useValue: mailService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  describe('requestOtp', () => {
    it('rejects when neither phone nor email is provided', async () => {
      await expect(service.requestOtp()).rejects.toThrow(BadRequestException);
    });

    it('rate-limits after 3 requests within the 10-minute window', async () => {
      otpModel.countDocuments.mockResolvedValue(3);

      await expect(service.requestOtp(undefined, 'a@b.com')).rejects.toThrow(HttpException);
      expect(otpModel.create).not.toHaveBeenCalled();
    });

    it('invalidates previous unused OTPs and sends a new one via email', async () => {
      await service.requestOtp(undefined, 'Test@Example.com');

      expect(otpModel.updateMany).toHaveBeenCalledWith(
        { identifier: 'test@example.com', used: false },
        { $set: { used: true } },
      );
      expect(otpModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'test@example.com', channel: 'email' }),
      );
      expect(mailService.sendOtpEmail).toHaveBeenCalledWith('test@example.com', expect.any(String));
      expect(smsService.sendOtp).not.toHaveBeenCalled();
    });

    it('routes phone identifiers via SMS', async () => {
      await service.requestOtp('+15551234567', undefined);

      expect(smsService.sendOtp).toHaveBeenCalledWith('+15551234567', expect.any(String));
      expect(mailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('wraps delivery failures in a BadRequestException instead of leaking the provider error', async () => {
      mailService.sendOtpEmail.mockRejectedValue(new Error('SES down'));

      await expect(service.requestOtp(undefined, 'a@b.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyOtp', () => {
    function makeRecord(overrides: Partial<{ otpHash: string; attempts: number; used: boolean }> = {}) {
      return {
        otpHash: overrides.otpHash ?? '',
        attempts: overrides.attempts ?? 0,
        used: overrides.used ?? false,
        save: jest.fn().mockResolvedValue(undefined),
      };
    }

    function mockFindOne(record: unknown) {
      otpModel.findOne.mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(record) }),
      });
    }

    it('rejects when no valid (unused, unexpired) OTP record exists', async () => {
      mockFindOne(null);

      await expect(service.verifyOtp(undefined, 'a@b.com', '123456')).rejects.toThrow(UnauthorizedException);
    });

    it('accepts a correct code, marks the record used, and resolves the user', async () => {
      const otpHash = await bcrypt.hash('123456', 10);
      const record = makeRecord({ otpHash });
      mockFindOne(record);
      usersService.findOrCreateByEmailOtp.mockResolvedValue({ _id: 'user-1' } as any);

      const user = await service.verifyOtp(undefined, 'a@b.com', '123456');

      expect(record.used).toBe(true);
      expect(record.save).toHaveBeenCalled();
      expect(user).toEqual({ _id: 'user-1' });
    });

    it('rejects an incorrect code without marking the record used, and increments attempts', async () => {
      const otpHash = await bcrypt.hash('123456', 10);
      const record = makeRecord({ otpHash, attempts: 0 });
      mockFindOne(record);

      await expect(service.verifyOtp(undefined, 'a@b.com', 'wrong1')).rejects.toThrow(UnauthorizedException);

      expect(record.attempts).toBe(1);
      expect(record.used).toBe(false);
      expect(record.save).toHaveBeenCalled();
    });

    it('locks the OTP out after exceeding the max verify attempts (replay/brute-force protection)', async () => {
      const otpHash = await bcrypt.hash('123456', 10);
      const record = makeRecord({ otpHash, attempts: 5 });
      mockFindOne(record);

      await expect(service.verifyOtp(undefined, 'a@b.com', '123456')).rejects.toThrow(UnauthorizedException);

      expect(record.used).toBe(true);
      expect(usersService.findOrCreateByEmailOtp).not.toHaveBeenCalled();
    });

    it('resolves users by phone on the SMS channel', async () => {
      const otpHash = await bcrypt.hash('123456', 10);
      const record = makeRecord({ otpHash });
      mockFindOne(record);
      usersService.findOrCreateByPhone.mockResolvedValue({ _id: 'user-2' } as any);

      await service.verifyOtp('+15551234567', undefined, '123456');

      expect(usersService.findOrCreateByPhone).toHaveBeenCalledWith('+15551234567');
      expect(usersService.findOrCreateByEmailOtp).not.toHaveBeenCalled();
    });
  });
});
