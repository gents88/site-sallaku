import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// `import x = require`: con `import x from` (senza esModuleInterop) twilio_1.default è undefined
// e il costruttore lanciava TypeError appena TWILIO_* era configurato.
import twilio = require('twilio');

@Injectable()
export class SmsService {
  private readonly client: ReturnType<typeof twilio> | null = null;
  private readonly fromNumber: string;
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER', '');

    if (accountSid && authToken && this.fromNumber) {
      this.client = twilio(accountSid, authToken);
    } else {
      this.logger.warn(
        'Twilio credentials not configured. OTPs will be logged to console only (dev mode).',
      );
    }
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const body = `Your verification code is: ${code}. Valid for 5 minutes. Do not share this code.`;

    if (!this.client) {
      // Dev/test mode: print OTP to console (never in production)
      this.logger.warn(`[SMS DEV MODE] OTP for ${to.slice(0, 4)}****: ${code}`);
      return;
    }

    await this.client.messages.create({
      body,
      from: this.fromNumber,
      to,
    });
  }
}
