import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { OtpService } from './otp.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private mailService: MailService,
    private otpService: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.usersService.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      role: 'user',
    });

    // Fire-and-forget welcome email
    this.mailService.sendWelcome(user.name, user.email);

    return this.signToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user);
  }

  async requestOtp(phone?: string, email?: string): Promise<{ message: string }> {
    return this.otpService.requestOtp(phone, email);
  }

  async verifyOtp(phone?: string, email?: string, otp?: string) {
    const user = await this.otpService.verifyOtp(phone, email, otp);
    return this.signToken(user);
  }

  private signToken(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email ?? null,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email ?? null,
        role: user.role,
      },
    };
  }
}
