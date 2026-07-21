import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface MailDeliveryResult {
  success: boolean;
  messageId?: string;
  accepted: string[];
  rejected: string[];
}

interface MailServiceStatus {
  configured: boolean;
  provider: 'resend' | 'smtp' | 'none';
  smtpUser: string | null;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly isConfigured: boolean;
  private readonly smtpUser?: string;

  /** When set, all emails are sent via Resend HTTP API instead of SMTP */
  private readonly resendApiKey?: string;

  constructor(private config: ConfigService) {
    this.resendApiKey = this.config.get<string>('RESEND_API_KEY');

    if (this.resendApiKey) {
      this.isConfigured = true;
      this.logger.log('MailService: using Resend HTTP API for delivery.');
      // Create a no-op transporter — will never be used when resendApiKey is set
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      return;
    }

    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    this.smtpUser = smtpUser;
    const hasPlaceholderUser = smtpUser === 'la-tua-email@gmail.com';
    const hasPlaceholderPass = smtpPass === 'la-tua-app-password-gmail';
    this.isConfigured = Boolean(smtpUser && smtpPass && !hasPlaceholderUser && !hasPlaceholderPass);

    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port:   this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: { user: smtpUser, pass: smtpPass },
    });

    if (!this.isConfigured) {
      this.logger.warn('Neither RESEND_API_KEY nor SMTP credentials are configured. Email delivery is disabled.');
    } else {
      this.logger.log('MailService: using SMTP for delivery.');
    }
  }

  private getAdminInbox(): string {
    return this.config.get<string>('EMAIL_TO')
      || this.config.get<string>('ADMIN_EMAIL')
      || 'gentsallaku@gmail.com';
  }

  getStatus(): MailServiceStatus {
    return {
      configured: this.isConfigured,
      provider: this.resendApiKey ? 'resend' : (this.isConfigured ? 'smtp' : 'none'),
      smtpUser: this.smtpUser ?? null,
    };
  }

  async send(opts: MailOptions): Promise<MailDeliveryResult> {
    if (!this.isConfigured) {
      this.logger.error(`Cannot send email → ${opts.to}. No mail provider configured.`);
      return { success: false, accepted: [], rejected: [opts.to] };
    }

    if (this.resendApiKey) {
      return this.sendViaResend(opts);
    }
    return this.sendViaSmtp(opts);
  }

  // ── Resend HTTP API (bypasses SMTP port blocking on Railway) ──────────────

  private async sendViaResend(opts: MailOptions): Promise<MailDeliveryResult> {
    const from = this.config.get<string>('EMAIL_FROM', 'Gent Sallaku <onboarding@resend.dev>');
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.resendApiKey}`,
        },
        body: JSON.stringify({
          from,
          to: [opts.to],
          subject: opts.subject,
          html: opts.html,
          ...(opts.text   ? { text: opts.text }       : {}),
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });

      const body = await response.json() as { id?: string; message?: string };

      if (response.ok && body.id) {
        this.logger.log(`Email accepted by Resend → ${opts.to} [${opts.subject}] (id=${body.id})`);
        return { success: true, messageId: body.id, accepted: [opts.to], rejected: [] };
      }

      this.logger.error(
        `Resend rejected email → ${opts.to} [${opts.subject}] status=${response.status} message=${body.message ?? JSON.stringify(body)}`,
      );
      return { success: false, accepted: [], rejected: [opts.to] };
    } catch (err) {
      this.logger.error(`Failed to call Resend API → ${opts.to}`, err);
      return { success: false, accepted: [], rejected: [opts.to] };
    }
  }

  // ── Nodemailer / SMTP fallback ────────────────────────────────────────────

  private async sendViaSmtp(opts: MailOptions): Promise<MailDeliveryResult> {
    const from = this.config.get<string>(
      'EMAIL_FROM',
      this.smtpUser ? `"Gent Sallaku" <${this.smtpUser}>` : '"Gent Sallaku" <noreply@gentsallaku.it>',
    );
    try {
      const info = await this.transporter.sendMail({ from, ...opts });
      const accepted = (info.accepted ?? []).map((item: any) => String(item));
      const rejected = (info.rejected ?? []).map((item: any) => String(item));
      const success = accepted.length > 0 && rejected.length === 0;

      if (success) {
        this.logger.log(`Email accepted by SMTP → ${opts.to} [${opts.subject}] (${info.messageId})`);
      } else {
        this.logger.error(
          `Email not fully accepted by SMTP → ${opts.to} accepted=${accepted.join(',')} rejected=${rejected.join(',')}`,
        );
      }
      return { success, messageId: info.messageId, accepted, rejected };
    } catch (err) {
      this.logger.error(`Failed to send email via SMTP → ${opts.to}`, err);
      return { success: false, accepted: [], rejected: [opts.to] };
    }
  }

  /** Welcome email sent on successful registration */
  sendWelcome(name: string, email: string): void {
    this.send({
      to: email,
      subject: `Benvenuto nel Portfolio di Gent Sallaku`,
      text: `Benvenuto, ${name}. Il tuo account e stato creato con successo. Vai su ${this.config.get('FRONTEND_URL', 'https://gentsallaku.it')}/admin per accedere al dashboard.`,
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
    }).catch(() => ({ success: false, accepted: [], rejected: [email] }));
  }

  /** Notification sent to admin when a contact form is submitted */
  sendContactNotification(opts: {
    name: string;
    email: string;
    subject: string;
    message: string;
    ip?: string;
    location?: string;
  }): Promise<MailDeliveryResult> {
    const adminEmail = this.getAdminInbox();
    const timestamp = new Date().toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const metaRows = [
      opts.ip       ? `<tr><td style="padding:6px 8px;color:#64748b;white-space:nowrap;">IP</td><td style="padding:6px 8px;font-family:monospace;font-size:0.85rem;">${opts.ip}</td></tr>` : '',
      opts.location ? `<tr><td style="padding:6px 8px;color:#64748b;white-space:nowrap;">Location</td><td style="padding:6px 8px;">${opts.location}</td></tr>` : '',
    ].join('');

    return this.send({
      to: adminEmail,
      replyTo: opts.email,
      subject: `[Contact Form] ${opts.subject}`,
      text: `New contact form message\n\nFrom: ${opts.name}\nEmail: ${opts.email}\nSubject: ${opts.subject}\nTimestamp: ${timestamp}${opts.ip ? `\nIP: ${opts.ip}` : ''}${opts.location ? `\nLocation: ${opts.location}` : ''}\nSource: Contact Form\n\n${opts.message}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:580px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);padding:24px 32px;display:flex;align-items:center;gap:12px;">
            <span style="font-family:monospace;font-size:1.6rem;font-weight:700;color:#fff;">&lt;GS /&gt;</span>
            <div>
              <div style="color:rgba(255,255,255,0.7);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;">Portfolio Notification</div>
              <h1 style="color:#fff;margin:0;font-size:1.15rem;">New Contact Form Message</h1>
            </div>
          </div>
          <div style="padding:28px 32px;">
            <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(79,106,245,0.25);overflow:hidden;margin-bottom:20px;">
              <div style="background:rgba(79,106,245,0.15);padding:10px 16px;border-bottom:1px solid rgba(79,106,245,0.2);">
                <span style="color:#818cf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">&#9993; Sender Details</span>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 16px;color:#64748b;white-space:nowrap;width:90px;">Name</td><td style="padding:8px 16px;font-weight:600;color:#e2e8f0;">${opts.name}</td></tr>
                <tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;">Email</td><td style="padding:8px 16px;"><a href="mailto:${opts.email}" style="color:#818cf8;">${opts.email}</a></td></tr>
                <tr><td style="padding:8px 16px;color:#64748b;">Subject</td><td style="padding:8px 16px;color:#e2e8f0;">${opts.subject}</td></tr>
                <tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;">Timestamp</td><td style="padding:8px 16px;color:#94a3b8;font-size:0.85rem;">${timestamp}</td></tr>
                <tr><td style="padding:8px 16px;color:#64748b;">Source</td><td style="padding:8px 16px;"><span style="background:rgba(79,106,245,0.2);color:#818cf8;padding:2px 8px;border-radius:12px;font-size:0.8rem;">Contact Form</span></td></tr>
                ${metaRows}
              </table>
            </div>
            <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(148,163,184,0.1);overflow:hidden;">
              <div style="background:rgba(148,163,184,0.05);padding:10px 16px;border-bottom:1px solid rgba(148,163,184,0.1);">
                <span style="color:#94a3b8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">&#128235; Message</span>
              </div>
              <div style="padding:20px 24px;line-height:1.75;color:#cbd5e1;">${opts.message.replace(/\n/g, '<br/>')}</div>
            </div>
            <div style="margin-top:20px;text-align:center;">
              <a href="mailto:${opts.email}?subject=Re: ${encodeURIComponent(opts.subject)}"
                 style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:0.9rem;">
                Reply to ${opts.name}
              </a>
            </div>
          </div>
          <div style="background:#070b15;padding:14px;text-align:center;font-size:0.78rem;color:#475569;">
            © ${new Date().getFullYear()} Gent Sallaku · <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    });
  }

  /** Real-time admin notification when a chatbot message is received */
  sendChatbotNotification(opts: {
    message: string;
    reply: string;
    sessionId: string;
    timestamp: Date;
    userEmail?: string;
    ip?: string;
    location?: string;
    userAgent?: string;
  }): Promise<MailDeliveryResult> {
    const adminEmail = this.getAdminInbox();
    const timestamp = opts.timestamp.toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const metaRows = [
      opts.ip        ? `<tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;white-space:nowrap;">IP</td><td style="padding:8px 16px;font-family:monospace;font-size:0.85rem;color:#94a3b8;">${opts.ip}</td></tr>` : '',
      opts.location  ? `<tr><td style="padding:8px 16px;color:#64748b;">Location</td><td style="padding:8px 16px;color:#e2e8f0;">${opts.location}</td></tr>` : '',
      opts.userAgent ? `<tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;white-space:nowrap;">User-Agent</td><td style="padding:8px 16px;color:#94a3b8;font-size:0.78rem;word-break:break-all;">${opts.userAgent.slice(0, 120)}${opts.userAgent.length > 120 ? '…' : ''}</td></tr>` : '',
    ].join('');

    return this.send({
      to: adminEmail,
      subject: `[Chatbot] New message — ${opts.message.slice(0, 50)}${opts.message.length > 50 ? '…' : ''}`,
      text: `New chatbot message\n\nSession: ${opts.sessionId}\nTimestamp: ${timestamp}${opts.userEmail ? `\nUser Email: ${opts.userEmail}` : ''}${opts.ip ? `\nIP: ${opts.ip}` : ''}${opts.location ? `\nLocation: ${opts.location}` : ''}\nSource: Chatbot\n\nUser: ${opts.message}\n\nAI: ${opts.reply}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:580px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#059669,#0891b2);padding:24px 32px;">
            <div style="color:rgba(255,255,255,0.7);font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;">Portfolio Notification</div>
            <h1 style="color:#fff;margin:6px 0 0;font-size:1.15rem;">&#129302; New Chatbot Interaction</h1>
          </div>
          <div style="padding:28px 32px;">
            <div style="background:#0f1831;border-radius:10px;border:1px solid rgba(8,145,178,0.25);overflow:hidden;margin-bottom:20px;">
              <div style="background:rgba(8,145,178,0.12);padding:10px 16px;border-bottom:1px solid rgba(8,145,178,0.2);">
                <span style="color:#38bdf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">&#128203; Metadata</span>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 16px;color:#64748b;white-space:nowrap;width:110px;">Session ID</td><td style="padding:8px 16px;font-family:monospace;font-size:0.82rem;color:#94a3b8;">${opts.sessionId}</td></tr>
                <tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;">Timestamp</td><td style="padding:8px 16px;color:#94a3b8;font-size:0.85rem;">${timestamp}</td></tr>
                ${opts.userEmail ? `<tr><td style="padding:8px 16px;color:#64748b;">User Email</td><td style="padding:8px 16px;"><a href="mailto:${opts.userEmail}" style="color:#818cf8;">${opts.userEmail}</a></td></tr>` : ''}
                <tr style="background:rgba(255,255,255,0.02);"><td style="padding:8px 16px;color:#64748b;">Source</td><td style="padding:8px 16px;"><span style="background:rgba(5,150,105,0.2);color:#34d399;padding:2px 8px;border-radius:12px;font-size:0.8rem;">Chatbot</span></td></tr>
                ${metaRows}
              </table>
            </div>
            <div style="margin-bottom:12px;padding:16px 20px;background:#1e2a4a;border-radius:10px;border-left:3px solid #818cf8;">
              <div style="color:#818cf8;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">&#128100; User</div>
              <p style="margin:0;line-height:1.7;color:#e2e8f0;">${opts.message.replace(/\n/g, '<br/>')}</p>
            </div>
            <div style="padding:16px 20px;background:#0f1424;border-radius:10px;border-left:3px solid #34d399;">
              <div style="color:#34d399;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">&#129302; AI Reply</div>
              <p style="margin:0;line-height:1.7;color:#cbd5e1;">${opts.reply.replace(/\n/g, '<br/>')}</p>
            </div>
          </div>
          <div style="background:#070b15;padding:14px;text-align:center;font-size:0.78rem;color:#475569;">
            © ${new Date().getFullYear()} Gent Sallaku · <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    });
  }

  /** Auto-reply sent to the person who submitted the contact form */
  sendContactAutoReply(name: string, email: string): Promise<MailDeliveryResult> {
    return this.send({
      to: email,
      subject: `Ho ricevuto il tuo messaggio! – Gent Sallaku`,
      text: `Ciao ${name}, ho ricevuto il tuo messaggio. Ti rispondero il prima possibile. Nel frattempo puoi visitare ${this.config.get('FRONTEND_URL', 'https://gentsallaku.it')}.`,
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
    });
  }

  /** Chat transcript sent to an email address after a chatbot conversation */
  sendChatTranscript(
    to: string,
    messages: { role: string; content: string; timestamp: Date }[],
  ): Promise<MailDeliveryResult> {
    const adminEmail = this.getAdminInbox();
    const date = new Date().toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const messagesHtml = messages
      .map((m) => {
        const isUser = m.role === 'user';
        const bgColor = isUser ? '#1e2a4a' : '#0f1424';
        const label = isUser ? 'You' : 'AI Assistant';
        const labelColor = isUser ? '#818cf8' : '#34d399';
        const ts = new Date(m.timestamp).toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `
          <div style="margin-bottom:12px;padding:14px 16px;background:${bgColor};border-radius:10px;border-left:3px solid ${labelColor};">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
              <strong style="color:${labelColor};font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">${label}</strong>
              <span style="color:#64748b;font-size:0.75rem;">${ts}</span>
            </div>
            <p style="margin:0;line-height:1.6;color:#e2e8f0;">${m.content.replace(/\n/g, '<br/>')}</p>
          </div>`;
      })
      .join('');

    const plainText = messages
      .map((m) => {
        const label = m.role === 'user' ? 'You' : 'AI';
        const ts = new Date(m.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        return `[${ts}] ${label}: ${m.content}`;
      })
      .join('\n');

    return this.send({
      to: adminEmail,
      replyTo: to,
      subject: `[Portfolio Chatbot] Transcript – ${date}`,
      text: `Chat transcript from ${to} on ${date}\n\n${plainText}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:620px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);padding:28px 32px;">
            <span style="font-family:monospace;font-size:1.8rem;font-weight:700;color:#fff;">&lt;GS /&gt;</span>
            <h1 style="color:#fff;margin:10px 0 4px;font-size:1.25rem;">Chat Transcript</h1>
            <p style="color:rgba(255,255,255,0.8);margin:0;font-size:0.9rem;">${date}</p>
          </div>
          <div style="padding:28px 32px;">
            <p style="color:#94a3b8;margin-top:0;">A visitor requested the transcript of their chat session.</p>
            <p style="margin-bottom:20px;"><strong>Sent to:</strong> <a href="mailto:${to}" style="color:#818cf8;">${to}</a></p>
            <div style="border-radius:10px;overflow:hidden;border:1px solid rgba(148,163,184,0.12);">
              <div style="background:#0f1424;padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.12);">
                <strong style="color:#94a3b8;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em;">Conversation — ${messages.length} messages</strong>
              </div>
              <div style="padding:16px;">${messagesHtml}</div>
            </div>
          </div>
          <div style="background:#0f1424;padding:14px;text-align:center;font-size:0.8rem;color:#64748b;">
            © ${new Date().getFullYear()} Gent Sallaku · <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    });
  }

  /** OTP email for passwordless login */
  sendOtpEmail(email: string, code: string): Promise<MailDeliveryResult> {
    return this.send({
      to: email,
      subject: `Your verification code: ${code}`,
      text: `Your one-time login code is: ${code}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0a0e1a;color:#e2e8f0;border-radius:12px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#4f6af5,#8b5cf6);padding:28px 32px;text-align:center;">
            <span style="font-family:monospace;font-size:2rem;font-weight:700;color:#fff">&lt;GS /&gt;</span>
            <h1 style="color:#fff;margin:10px 0 0;font-size:1.2rem;">Verification Code</h1>
          </div>
          <div style="padding:36px 32px;text-align:center;">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:0.95rem;">Use the code below to sign in to the Admin Dashboard</p>
            <div style="display:inline-block;margin:24px auto;padding:20px 36px;background:#0f1831;border:2px solid rgba(99,102,241,0.4);border-radius:12px;letter-spacing:0.35em;font-size:2.4rem;font-weight:700;font-family:monospace;color:#a5b4fc;">
              ${code}
            </div>
            <p style="margin:0;color:#64748b;font-size:0.82rem;">
              ⏱ This code expires in <strong style="color:#e2e8f0;">5 minutes</strong>.<br/>
              Never share this code with anyone.
            </p>
          </div>
          <div style="background:#070b15;padding:14px;text-align:center;font-size:0.78rem;color:#475569;">
            If you did not request this code, you can safely ignore this email.
            &nbsp;·&nbsp;
            <a href="https://gentsallaku.it" style="color:#818cf8;">gentsallaku.it</a>
          </div>
        </div>
      `,
    });
  }
}
