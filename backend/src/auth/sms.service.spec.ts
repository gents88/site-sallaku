import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

const TWILIO: Record<string, string> = {
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'test-token',
  TWILIO_PHONE_NUMBER: '+15005550006',
};

function makeConfig(env: Record<string, string>): ConfigService {
  return { get: (k: string, def?: string) => env[k] ?? def } as unknown as ConfigService;
}

/** Usa il vero SDK twilio: col vecchio default import il costruttore lanciava TypeError. */
describe('SmsService', () => {
  it('builds a real Twilio client when credentials are configured', () => {
    expect(() => new SmsService(makeConfig(TWILIO))).not.toThrow();
  });

  it('falls back to console mode without credentials', () => {
    const config = { get: (_k: string, def?: string) => def } as unknown as ConfigService;
    expect(() => new SmsService(config)).not.toThrow();
  });

  it('in produzione senza Twilio non è disponibile e non finge l’invio', async () => {
    const sms = new SmsService(makeConfig({ NODE_ENV: 'production' }));

    expect(sms.isAvailable()).toBe(false);
    await expect(sms.sendOtp('+393331234567', '123456')).rejects.toThrow('Twilio is not configured');
  });

  it('fuori produzione senza Twilio scrive il codice nel log (dev mode)', async () => {
    const sms = new SmsService(makeConfig({ NODE_ENV: 'development' }));

    expect(sms.isAvailable()).toBe(true);
    await expect(sms.sendOtp('+393331234567', '123456')).resolves.toBeUndefined();
  });

  it('con Twilio configurato manda l’SMS dal numero del mittente', async () => {
    const sms = new SmsService(makeConfig({ NODE_ENV: 'production', ...TWILIO }));
    const create = jest.fn().mockResolvedValue({ sid: 'SM1' });
    (sms as any).client.messages.create = create;

    expect(sms.isAvailable()).toBe(true);
    await sms.sendOtp('+393331234567', '123456');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+15005550006', to: '+393331234567', body: expect.stringContaining('123456') }),
    );
  });
});
