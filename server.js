require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// Trust only the first proxy hop for accurate IP detection
app.set('trust proxy', 1);

const {
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '465',
  SMTP_SECURE = 'true',
  SMTP_USER,
  SMTP_PASS,
  FROM_NAME = 'Sito - Contatto',
  FROM_EMAIL,
  PORT = 3000,
  CORS_ORIGIN,
} = process.env;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn('Warning: SMTP_USER or SMTP_PASS not set. Check .env file.');
}

// ── CORS — restrict to explicit allowed origins ──────────────────────────────
const allowedOrigins = (CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '16kb' })); // Limit request body size

// ── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  );
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Angular + inline gtag init in index.html + JSON-LD injected via DOM
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
      // Angular Material inline styles + Google Fonts + Font Awesome CDN
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      // Web fonts
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      // Images: self, data URIs, and any HTTPS (covers CDN images in blog posts)
      "img-src 'self' data: https:",
      // GA4 analytics endpoints
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://region1.analytics.google.com",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: SMTP_SECURE === 'true',
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
});

// Rate limiting for the email endpoint — 5 submissions per 15 minutes per IP
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, please try again later.' },
});

// General API rate limit — 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limit to all API routes
app.use('/api/', apiLimiter);

// Verify transporter (best-effort)
transporter.verify().then(() => {
  console.log('SMTP transporter is ready');
}).catch((err) => {
  console.warn('SMTP transporter verification failed:', err && err.message ? err.message : err);
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve sitemap.xml from project root so the file is available at /sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

// Endpoint to receive form data and send email
app.post('/api/send-email', emailLimiter, async (req, res) => {
  try {
    const { name, email, message, hp } = req.body || {};

    // Honeypot check: if filled, likely bot — silent discard
    if (hp) {
      return res.status(400).json({ ok: false, error: 'Bot detected' });
    }

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: name, email, message.' });
    }

    // Input length limits — prevent oversized payloads reaching the SMTP server
    if (typeof name !== 'string' || name.length > 80) {
      return res.status(400).json({ ok: false, error: 'Name too long (max 80 characters).' });
    }
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    }
    if (typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({ ok: false, error: 'Message too long (max 2000 characters).' });
    }

    const to = FROM_EMAIL || SMTP_USER;
    const mailOptions = {
      from: `"${escapeHtml(FROM_NAME)}" <${FROM_EMAIL || SMTP_USER}>`,
      to,
      subject: `Nuovo contatto dal sito: ${escapeHtml(name)}`,
      replyTo: email,
      // Plain-text version (safe by definition)
      text: `Nome: ${name}\nEmail: ${email}\n\nMessaggio:\n${message}`,
      // HTML version — all user values are HTML-escaped
      html: `<p><strong>Nome:</strong> ${escapeHtml(name)}</p>
             <p><strong>Email:</strong> ${escapeHtml(email)}</p>
             <p><strong>Messaggio:</strong></p>
             <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
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
