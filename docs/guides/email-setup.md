Esempio: invio email da form (Express + nodemailer)

Istruzioni rapide

1) Installa dipendenze

```bash
npm install
```

2) Crea un file `.env` copiando `.env.example` e inserisci le tue credenziali SMTP.

3) Avvia il server

```bash
npm start
```

4) Apri la pagina di test

Visita `http://localhost:3000/contact.html` per provare il form.

Test via curl

```bash
curl -X POST http://localhost:3000/api/send-email \
  -H "Content-Type: application/json" \
  -d '{"name":"Mario","email":"mario@example.com","message":"Ciao dal test"}'
```

Note di sicurezza

- Non committare `.env` con credenziali.
- Proteggi l'endpoint con rate limiting o CAPTCHA in produzione.
- Per Gmail usa App Password se hai 2FA, oppure usa provider come SendGrid/Mailgun/Amazon SES per gestire deliverability.
