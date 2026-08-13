# Deploy Backend su Plesk — Guida completa

## Come funziona dopo la migrazione

Attualmente il frontend su Plesk chiama il backend su Railway tramite URL assoluto.
L'obiettivo è far girare backend + MongoDB + Redis su Plesk nello stesso server,
con nginx che fa da "ponte" tra le richieste in arrivo e il backend Docker.

```
Browser
  │
  ▼
Plesk nginx (porta 443, HTTPS)
  ├── /api/*   →  proxya a  http://127.0.0.1:3000  (NestJS in Docker)
  └── /*       →  serve i file Angular SSR / statici
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
         MongoDB :27017         Redis :6379
         (Docker, interno)    (Docker, interno)
```

MongoDB e Redis NON sono raggiungibili da fuori: vivono nella rete Docker privata
e comunicano col backend tramite hostname `mongo` e `redis`.

---

## Ordine degli step

| # | Dove si fa | Cosa |
|---|-----------|------|
| 1 | Locale | Compila le variabili d'ambiente |
| 2 | Locale → Server | Esporta il DB da Railway e lo copia su Plesk |
| 3 | Server Plesk | Avvia Docker (backend + mongo + redis) |
| 4 | Pannello Plesk | Configura il reverse proxy nginx |
| 5 | Locale | Rebuilda il frontend con i nuovi URL |
| 6 | Browser | Verifica che tutto funzioni |

---

## 1. Compila le variabili d'ambiente

Il file `.env.plesk` nella root del progetto contiene tutti i parametri di configurazione.
**Non ha valori reali di default** — devi compilarlo prima di avviare Docker.

### 1a. Connettiti al server via SSH

```bash
ssh user@tuo-server-plesk
cd /path/to/project   # es. /var/www/vhosts/gentsallaku.it/site-sallaku
```

### 1b. Apri il file e sostituisci i placeholder

```bash
nano .env.plesk
```

I valori **obbligatori** da cambiare:

| Variabile | Come ottenerla |
|-----------|---------------|
| `JWT_SECRET` | Genera sul server: `openssl rand -base64 48` |
| `ADMIN_PASSWORD` | Scegli una password sicura (min. 12 caratteri) |
| `SMTP_USER` | Il tuo indirizzo Gmail |
| `SMTP_PASS` | Una "App Password" Gmail (non la password normale) — [crea qui](https://myaccount.google.com/apppasswords) |

> **Lascia invariati** `MONGODB_URI=mongodb://mongo:27017/portfolio` e `REDIS_URL=redis://redis:6379`.
> Questi hostname (`mongo`, `redis`) funzionano solo dentro la rete Docker interna.

Esempio del blocco JWT:
```
JWT_SECRET=u7Kx9mP2qR5vTw8yAzBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789==
JWT_EXPIRES_IN=7d
```

---

## 2. Migrazione dati da Railway

Questo step esporta il database MongoDB attuale su Railway e lo importa su Plesk.
Se preferisci partire con un DB vuoto, salta al passo 3.

### 2a. Recupera la MongoDB URI da Railway

1. Vai su [railway.com](https://railway.com) → il tuo progetto
2. Clicca sul servizio **MongoDB**
3. Vai in **Variables** e copia il valore di `MONGODB_URL`

Sarà qualcosa come:
```
mongodb://mongo:AbCdEfGh@roundhouse.proxy.rlwy.net:12345/railway
```

### 2b. Esegui il dump (dalla tua macchina locale, a progetto clonato)

```bash
cd /Users/gent/projects/site-sallaku

MONGO_URI="mongodb://mongo:AbCdEfGh@roundhouse.proxy.rlwy.net:12345/railway" \
  ./scripts/mongo-dump.sh
```

Lo script usa Docker internamente — non serve `mongodump` installato localmente.
Al termine crea il file: `backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz`

Verifica che il file esista:
```bash
ls -lh backups/
```

### 2c. Copia il backup sul server Plesk

```bash
# Sostituisci user, indirizzo e percorso con i tuoi valori reali
scp backups/mongo-backup-*.archive.gz \
  user@tuo-server-plesk:/path/to/project/backups/
```

### 2d. Avvia solo MongoDB su Plesk (temporaneamente, per il restore)

```bash
# Sul server Plesk via SSH
cd /path/to/project
docker compose -f docker-compose.plesk.yml up -d mongo

# Aspetta che MongoDB sia pronto (cerca "healthy" nella colonna STATUS)
docker compose -f docker-compose.plesk.yml ps
```

Se dopo 40 secondi lo stato è ancora `starting`, controlla i log:
```bash
docker compose -f docker-compose.plesk.yml logs mongo
```

### 2e. Importa il backup in MongoDB

```bash
# Sul server Plesk via SSH, nella root del progetto
TARGET_URI="mongodb://localhost:27017" \
  ./scripts/mongo-restore.sh backups/mongo-backup-YYYYMMDD-HHMMSS.archive.gz
```

Lo script trova automaticamente l'ultimo backup se non specifichi il nome del file:
```bash
TARGET_URI="mongodb://localhost:27017" ./scripts/mongo-restore.sh
```

---

## 3. Avvia il backend completo

```bash
# Sul server Plesk via SSH, nella root del progetto
./scripts/deploy-plesk-backend.sh
```

Lo script:
1. verifica che `.env.plesk` sia compilato correttamente
2. builda l'immagine Docker del backend NestJS
3. avvia backend + mongo + redis con `docker compose`
4. attende che il backend sia "healthy" prima di uscire

Controlla lo stato finale:
```bash
docker compose -f docker-compose.plesk.yml ps
```

Dovresti vedere tutti e tre i servizi con `STATUS = healthy`:
```
NAME        IMAGE     STATUS              PORTS
mongo       mongo:7   Up 2 minutes (healthy)
redis       redis:7   Up 2 minutes (healthy)
backend     ...       Up 1 minute  (healthy)   127.0.0.1:3000->3000/tcp
```

Test rapido diretto (senza passare da nginx):
```bash
curl http://localhost:3000/api/v1/system/health
# Risposta attesa: {"status":"ok", ...}
```

---

## 4. Configura il Reverse Proxy su Plesk

Questo è il passaggio che "collega" il dominio `gentsallaku.it` al backend Docker.
Plesk usa nginx come proxy: le richieste a `/api/...` vengono girate alla porta 3000.

### Come farlo dalla GUI Plesk

1. Apri **Plesk → Domini → gentsallaku.it**
2. Clicca su **Apache & nginx Settings**
3. Scorri fino alla sezione **"Additional nginx directives"** (o "Direttive nginx aggiuntive")
4. Incolla questo blocco nel campo di testo:

```nginx
# Backend API
location /api/ {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
}

# Frontend Angular SSR (porta 4000)
location / {
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 60s;
}
```

5. Clicca **OK** in fondo alla pagina.

> **Cosa fa questo blocco:** le richieste a `/api/...` vanno al backend Docker (porta 3000),
> tutte le altre (pagine, assets) vanno al frontend Angular SSR (porta 4000).

---

## 5. Aggiorna il Frontend

Ci sono due modalità. Usa quella che preferisci.

---

### 5A. Metodo FileZilla (file statici — attualmente in uso)

Il frontend viene compilato in locale e caricato via FTP/SFTP. **Nessun container Docker** per il frontend.

#### 5A.1 — Build locale

```bash
# Dalla root del progetto
./scripts/build-frontend-filezilla.sh
```

Lo script:
1. Esegue `ng build --configuration production`
2. Crea `frontend-deploy.zip` nella root del progetto con il contenuto di `dist/portfolio-frontend/browser/`

#### 5A.2 — Carica su Plesk via FileZilla

1. Apri FileZilla e connettiti al server Plesk via **SFTP** (porta 22)
2. Naviga nella web root del dominio:
   ```
   /var/www/vhosts/gentsallaku.it/httpdocs/
   ```
3. **Estrai e carica** il contenuto di `frontend-deploy.zip` (non la cartella, ma i file dentro)
   — in FileZilla puoi trascinare i file direttamente dalla cartella `frontend/dist/portfolio-frontend/browser/`

#### 5A.3 — Nginx Plesk (solo prima volta o se cambia)

In **Plesk → Domini → gentsallaku.it → Apache & nginx Settings → Additional nginx directives**
usa questo blocco (sostituisce quello del passo 4 se hai il proxy a porta 4000):

```nginx
# Proxy API requests to backend Docker (porta 3000)
location /api/ {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}

# Serve Angular SPA assets con cache aggressiva (filenames hash-ati)
location ~* \.(js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|webp|gif|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
}

# i18n JSON: cache breve (cambiano ad ogni deploy)
location ~* ^/i18n/ {
    expires 10m;
    add_header Cache-Control "public, must-revalidate";
    try_files $uri =404;
}

# SPA fallback: restituisce index.html per tutte le route Angular
location / {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files $uri $uri/ /index.html;
}
```

> **Nota:** con questo config il container Docker del frontend (porta 4000) **non serve**.
> Puoi fermarlo: `docker compose -f docker-compose.plesk.yml stop frontend`

---

### 5B. Metodo Docker SSR (alternativa futura)

Il frontend gira in un container Docker (porta 4000) con Angular SSR.

**Primo avvio o aggiornamento codice:**
```bash
# Sul server Plesk via SSH, nella root del progetto
docker compose -f docker-compose.plesk.yml build frontend
docker compose -f docker-compose.plesk.yml up -d --no-deps frontend
```

Il browser usa `/api/v1` (URL relativo gestito dal proxy nginx di Plesk).

---

## 6. Verifica finale

```bash
# 1. Backend raggiungibile tramite nginx (HTTPS pubblico)
curl https://gentsallaku.it/api/v1/system/health

# 2. Test endpoint contatti
curl -X POST https://gentsallaku.it/api/v1/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"test@test.it","message":"Verifica deploy Plesk"}'
# Risposta attesa: {"message":"..."}

# 3. Controlla che il frontend carichi correttamente
curl -I https://gentsallaku.it
# Risposta attesa: HTTP/2 200
```

Se qualcosa non funziona, guarda i log:
```bash
docker compose -f docker-compose.plesk.yml logs --tail=50 backend
docker compose -f docker-compose.plesk.yml logs --tail=50 frontend
```

---

## Comandi utili post-deploy

```bash
# Log in tempo reale
docker compose -f docker-compose.plesk.yml logs -f backend
docker compose -f docker-compose.plesk.yml logs -f frontend

# Riavvia solo il backend (dopo una modifica al codice)
docker compose -f docker-compose.plesk.yml build backend && \
docker compose -f docker-compose.plesk.yml up -d --no-deps backend

# Riavvia solo il frontend (dopo una modifica al codice)
docker compose -f docker-compose.plesk.yml build frontend && \
docker compose -f docker-compose.plesk.yml up -d --no-deps frontend

# Aggiorna le immagini base (sicurezza)
docker compose -f docker-compose.plesk.yml pull
docker compose -f docker-compose.plesk.yml up -d

# Backup MongoDB su Plesk
MONGO_URI="mongodb://localhost:27017/portfolio" ./scripts/mongo-dump.sh

# Stop completo
docker compose -f docker-compose.plesk.yml down
```
