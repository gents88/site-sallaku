import { Logger } from '@nestjs/common';
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

  describe('ripiego SMTP non utilizzabile', () => {
    // Configurazione di produzione: l'SMTP è il relay di Resend, utente "resend".
    const RESEND_RELAY = { SMTP_HOST: 'smtp.resend.com', SMTP_USER: 'resend', SMTP_PASS: 're_test' };

    it('non ripiega sul relay di Resend: stesso provider, stesse restrizioni', async () => {
      mockResend(403, { message: 'domain is not verified' });
      const mail = makeService({ ...RESEND, ...RESEND_RELAY });

      const result = await mail.send(MAIL);

      expect(result.success).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('non ripiega se SMTP_USER non è un indirizzo email: non può fare da mittente', async () => {
      mockResend(403, { message: 'domain is not verified' });
      const mail = makeService({ ...RESEND, SMTP_USER: 'apikey', SMTP_PASS: 'secret', SMTP_HOST: 'smtp.sendgrid.net' });

      expect((await mail.send(MAIL)).success).toBe(false);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('con una casella SMTP vera su un altro host il ripiego resta attivo', async () => {
      mockResend(403, { message: 'domain is not verified' });
      const mail = makeService({ ...RESEND, SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'gent@gmail.com', SMTP_PASS: 'app-pass' });

      expect((await mail.send(MAIL)).success).toBe(true);
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Gent Sallaku" <gent@gmail.com>' }));
    });

    it('spiega cosa fare nel log, una volta sola', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        mockResend(403, { message: 'domain is not verified' });
        const mail = makeService({ ...RESEND, ...RESEND_RELAY });

        await mail.send(MAIL);
        await mail.send(MAIL);
        await mail.send(MAIL);

        const hints = warn.mock.calls.filter(([msg]) => String(msg).includes('resend.com/domains'));
        expect(hints).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('un messaggio consegnato da Resend non produce alcuna indicazione', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        mockResend(200, { id: 'resend-ok' });
        const mail = makeService({ ...RESEND, ...RESEND_RELAY });

        await mail.send(MAIL);

        expect(warn.mock.calls.filter(([msg]) => String(msg).includes('resend.com/domains'))).toHaveLength(0);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('MAIL_PREFER_SMTP (casella del dominio, es. IONOS, con Resend non verificato)', () => {
    const IONOS = { SMTP_HOST: 'smtp.ionos.it', SMTP_USER: 'noreply@gentsallaku.it', SMTP_PASS: 'secret', MAIL_PREFER_SMTP: 'true' };

    it('invia dalla casella SMTP senza nemmeno chiamare Resend', async () => {
      mockResend(200, { id: 'non-deve-servire' });
      const mail = makeService({ ...RESEND, ...IONOS });

      const result = await mail.send(MAIL);

      expect(result.success).toBe(true);
      expect((global as any).fetch).not.toHaveBeenCalled();
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Gent Sallaku" <noreply@gentsallaku.it>', to: MAIL.to }));
    });

    it('se l\'SMTP non consegna ripiega su Resend', async () => {
      sendMail.mockRejectedValue(new Error('535 auth failed'));
      mockResend(200, { id: 'resend-ripiego' });
      const mail = makeService({ ...RESEND, ...IONOS });

      const result = await mail.send(MAIL);

      expect(result).toEqual(expect.objectContaining({ success: true, messageId: 'resend-ripiego' }));
    });

    it('se l\'SMTP non consegna e Resend non c\'è restituisce il fallimento', async () => {
      sendMail.mockRejectedValue(new Error('timeout'));
      const mail = makeService({ ...IONOS });

      expect((await mail.send(MAIL)).success).toBe(false);
    });

    it('lo stato indica smtp come provider', () => {
      expect(makeService({ ...RESEND, ...IONOS }).getStatus().provider).toBe('smtp');
    });

    it('senza il flag resta il comportamento di prima: prima Resend', async () => {
      mockResend(200, { id: 'resend-1' });
      const { MAIL_PREFER_SMTP: _omit, ...withoutFlag } = IONOS;
      const mail = makeService({ ...RESEND, ...withoutFlag });

      await mail.send(MAIL);

      expect((global as any).fetch).toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
      expect(mail.getStatus().provider).toBe('resend');
    });

    it('il flag non ha effetto se l\'SMTP non è utilizzabile (relay di Resend): si usa Resend', async () => {
      mockResend(200, { id: 'resend-1' });
      const mail = makeService({ ...RESEND, SMTP_HOST: 'smtp.resend.com', SMTP_USER: 'resend', SMTP_PASS: 're_x', MAIL_PREFER_SMTP: 'true' });

      await mail.send(MAIL);

      expect((global as any).fetch).toHaveBeenCalled();
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  it('considera non configurate le credenziali SMTP d’esempio di .env.example', async () => {
    const mail = makeService({ SMTP_USER: 'your-email@gmail.com', SMTP_PASS: 'whatever' });

    expect(mail.getStatus().configured).toBe(false);
    expect((await mail.send(MAIL)).success).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
