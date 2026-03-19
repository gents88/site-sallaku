import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port:   this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async send(opts: MailOptions): Promise<void> {
    const from = this.config.get<string>(
      'EMAIL_FROM',
      '"Gent Sallaku" <noreply@gentsallaku.it>',
    );
    try {
      await this.transporter.sendMail({ from, ...opts });
      this.logger.log(`Email sent → ${opts.to} [${opts.subject}]`);
    } catch (err) {
      this.logger.error(`Failed to send email → ${opts.to}`, err);
      // Do not rethrow — mail failure should not block API response
    }
  }

  /** Welcome email sent on successful registration */
  sendWelcome(name: string, email: string): void {
    this.send({
      to: email,
      subject: `Benvenuto nel Portfolio di Gent Sallaku`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);padding:32px;text-align:center;">
            <span style="font-family:monospace;font-size:2rem;font-weight:700;color:#fff">
              &lt;GS /&gt;
            </span>
            <h1 style="color:#fff;margin:12px 0 0;font-size:1.4rem;">Benvenuto, ${name}!</h1>
          </div>
          <div style="padding:32px;">
            <p>Il tuo account è stato creato con successo. Ora hai accesso al <strong>Dashboard di amministrazione</strong> del portfolio.</p>
            <p>Con il tuo account puoi:</p>
            <ul style="padding-left:20px;line-height:2;">
              <li>Gestire progetti, esperienze e post del blog</li>
              <li>Aggiornare la sezione About</li>
              <li>Visualizzare le statistiche del sito</li>
            </ul>
            <div style="text-align:center;margin:28px 0;">
              <a href="${this.config.get('FRONTEND_URL', 'https://gentsallaku.it')}/admin"
                 style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                Vai al Dashboard
              </a>
            </div>
            <p style="color:#94a3b8;font-size:0.85rem;">Se non hai richiesto questo account, ignora questa email.</p>
          </div>
          <div style="background:#0f1424;padding:16px;text-align:center;font-size:0.8rem;color:#64748b;">
            © ${new Date().getFullYear()} Gent Sallaku · <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    }).catch(() => {});
  }

  /** Notification sent to admin when a contact form is submitted */
  sendContactNotification(opts: { name: string; email: string; subject: string; message: string }): void {
    const adminEmail = this.config.get<string>('EMAIL_TO', 'gent.sallaku@email.com');
    this.send({
      to: adminEmail,
      replyTo: opts.email,
      subject: `[Portfolio Contact] ${opts.subject}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;">
          <h2 style="color:#4f6af5;">Nuovo messaggio di contatto</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;color:#64748b;">Da</td><td style="padding:8px;font-weight:600;">${opts.name}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Email</td><td style="padding:8px;">${opts.email}</td></tr>
            <tr><td style="padding:8px;color:#64748b;">Oggetto</td><td style="padding:8px;">${opts.subject}</td></tr>
          </table>
          <hr style="border:1px solid #e2e8f0;margin:16px 0;"/>
          <p style="line-height:1.7;">${opts.message.replace(/\n/g, '<br/>')}</p>
        </div>
      `,
    }).catch(() => {});
  }

  /** Auto-reply sent to the person who submitted the contact form */
  sendContactAutoReply(name: string, email: string): void {
    this.send({
      to: email,
      subject: `Ho ricevuto il tuo messaggio! – Gent Sallaku`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);padding:32px;text-align:center;">
            <span style="font-family:monospace;font-size:2rem;font-weight:700;color:#fff">&lt;GS /&gt;</span>
          </div>
          <div style="padding:32px;">
            <h2 style="margin-top:0;">Ciao ${name}, ho ricevuto il tuo messaggio!</h2>
            <p>Grazie per avermi contattato. Ti risponderò nel più breve tempo possibile, solitamente entro 24–48 ore lavorative.</p>
            <p>Nel frattempo puoi visitare il mio portfolio per scoprire i miei progetti e competenze.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${this.config.get('FRONTEND_URL', 'https://gentsallaku.it')}"
                 style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                Visita il Portfolio
              </a>
            </div>
            <p style="color:#94a3b8;font-size:0.85rem;">Questo è un messaggio automatico, non rispondere a questa email.</p>
          </div>
          <div style="background:#0f1424;padding:16px;text-align:center;font-size:0.8rem;color:#64748b;">
            © ${new Date().getFullYear()} Gent Sallaku · <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    }).catch(() => {});
  }
}
