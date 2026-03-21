require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

const {
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '465',
  SMTP_SECURE = 'true',
  SMTP_USER,
  SMTP_PASS,
  FROM_NAME = 'Sito - Contatto',
  FROM_EMAIL,
  PORT = 3000,
} = process.env;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('Warning: SMTP_USER or SMTP_PASS not set. Check .env file.');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true',
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

// Basic rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

// Verify transporter (best-effort)
transporter.verify().then(() => {
  console.log('SMTP transporter is ready');
}).catch((err) => {
  console.warn('SMTP transporter verification failed:', err && err.message ? err.message : err);
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Endpoint to receive form data and send email
app.post('/api/send-email', apiLimiter, async (req, res) => {
  try {
    const { name, email, message, hp } = req.body || {};
    // Honeypot check: if filled, likely bot
    if (hp) {
      return res.status(400).json({ ok: false, error: 'Bot detected' });
    }
    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Dati mancanti: name, email e message sono richiesti.' });
    }

    const to = FROM_EMAIL || SMTP_USER;
    const mailOptions = {
      from: `"${FROM_NAME || name}" <${FROM_EMAIL || SMTP_USER}>`,
      to,
      subject: `Nuovo contatto dal sito: ${name}`,
      replyTo: email,
      text: `Nome: ${name}\nEmail: ${email}\n\nMessaggio:\n${message}`,
      html: `<p><strong>Nome:</strong> ${escapeHtml(name)}</p>
             <p><strong>Email:</strong> ${escapeHtml(email)}</p>
             <p><strong>Messaggio:</strong></p>
             <p>${escapeHtml(message).replace(/\n/g,'<br>')}</p>`,
    };

    const info = await transporter.sendMail(mailOptions);
    return res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('Errore invio email:', err);
    return res.status(500).json({ ok: false, error: 'Impossibile inviare email' });
  }
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

app.listen(PORT, () => {
  console.log(`Server avviato su http://localhost:${PORT}`);
});
