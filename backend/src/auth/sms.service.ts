import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// `import x = require`: con `import x from` (senza esModuleInterop) twilio_1.default è undefined
// e il costruttore lanciava TypeError appena TWILIO_* era configurato.
import twilio = require('twilio');

@Injectable()
export class SmsService {
  private readonly client: ReturnType<typeof twilio> | null = null;
  private readonly fromNumber: string;
  /** Senza Twilio, fuori produzione il codice finisce nel log invece che in un SMS. */
  private readonly devMode: boolean;
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER', '');
    this.devMode = this.config.get<string>('NODE_ENV') !== 'production';

    if (accountSid && authToken && this.fromNumber) {
      this.client = twilio(accountSid, authToken);
    } else if (this.devMode) {
      this.logger.warn(
        'Twilio credentials not configured. OTPs will be logged to console only (dev mode).',
      );
    } else {
      this.logger.warn('Twilio credentials not configured. SMS login is disabled.');
    }
  }

  /** In produzione senza Twilio l'SMS non può partire: il login via cellulare va nascosto. */
  isAvailable(): boolean {
    return this.client !== null || this.devMode;
  }

  async sendOtp(to: string, code: string): Promise<void> {
    const body = `Your verification code is: ${code}. Valid for 5 minutes. Do not share this code.`;

    if (!this.client) {
      // Prima qui si rispondeva "inviato" anche in produzione: l'utente
      // aspettava un SMS che non sarebbe mai arrivato.
      if (!this.devMode) throw new Error('Twilio is not configured');
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
