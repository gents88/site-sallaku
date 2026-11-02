import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { OtpService } from './otp.service';
import { SmsService } from './sms.service';
import { Otp, OtpSchema } from './schemas/otp.schema';

@Module({
  imports: [
    UsersModule,
    SecurityModule,
    MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        // Access token breve: il frontend lo rinnova da solo col refresh token (interceptor su
        // 401, AuthService.getFreshToken per i WebSocket). Default uguale a quello degli
        // .env.*.example, usato solo se JWT_EXPIRES_IN manca del tutto.
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRES_IN', '30m') as StringValue },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AdminBootstrapService, OtpService, SmsService],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
