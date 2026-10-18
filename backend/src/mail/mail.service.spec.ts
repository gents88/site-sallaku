import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

const sendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail })) }));

function makeService(env: Record<string, string | undefined>): MailService {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => env[key] ?? fallback),
  } as unknown as ConfigService;
  return new MailService(config);
}

const RESEND = { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Gent Sallaku <onboarding@resend.dev>' };
const SMTP = { SMTP_USER: 'box@gentsallaku.it', SMTP_PASS: 'secret' };
const MAIL = { to: 'visitor@example.com', subject: 'Code', html: '<p>123456</p>' };

function mockResend(status: number, body: Record<string, unknown>) {
  (global as any).fetch = jest.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });
}

describe('MailService', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue({ messageId: 'smtp-1', accepted: [MAIL.to], rejected: [] });
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('consegna via Resend senza toccare l’SMTP quando Resend accetta', async () => {
    mockResend(200, { id: 'resend-1' });
    const mail = makeService({ ...RESEND, ...SMTP });

    const result = await mail.send(MAIL);

    expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'resend-1' }));
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('se Resend rifiuta il destinatario ripiega sull’SMTP col mittente della casella', async () => {
    // Dominio non verificato: Resend consegna solo al titolare dell'account.
    mockResend(403, { message: 'You can only send testing emails to your own email address' });
    const mail = makeService({ ...RESEND, ...SMTP });

    const result = await mail.send(MAIL);

    expect(result.success).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: '"Gent Sallaku" <box@gentsallaku.it>', to: MAIL.to }),
    );
  });

  it('se Resend rifiuta e non c’è SMTP restituisce il fallimento', async () => {
    mockResend(403, { message: 'domain is not verified' });
    const mail = makeService({ ...RESEND });

    const result = await mail.send(MAIL);

    expect(result.success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('considera non configurate le credenziali SMTP d’esempio di .env.example', async () => {
    const mail = makeService({ SMTP_USER: 'your-email@gmail.com', SMTP_PASS: 'whatever' });

    expect(mail.getStatus().configured).toBe(false);
    expect((await mail.send(MAIL)).success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
