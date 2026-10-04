import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

/** Usa il vero SDK twilio: col vecchio default import il costruttore lanciava TypeError. */
describe('SmsService', () => {
  it('builds a real Twilio client when credentials are configured', () => {
    const env: Record<string, string> = {
      TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_PHONE_NUMBER: '+15005550006',
    };
    const config = { get: (k: string, def?: string) => env[k] ?? def } as unknown as ConfigService;
    expect(() => new SmsService(config)).not.toThrow();
  });

  it('falls back to console mode without credentials', () => {
    const config = { get: (_k: string, def?: string) => def } as unknown as ConfigService;
    expect(() => new SmsService(config)).not.toThrow();
  });
});
