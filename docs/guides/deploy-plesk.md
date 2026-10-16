# Backend + MongoDB su Plesk (addio Railway)

## Come sarà dopo la migrazione

```
Browser ──HTTPS──▶ Plesk (gentsallaku.it)
                     ├── /api/*        ─┐
                     ├── /socket.io/*  ─┴─▶ 127.0.0.1:3000  NestJS   (Docker)
                     └── tutto il resto ──▶ httpdocs/        Angular  (statico, FileZilla)
                                                 │
                                    rete Docker interna, nessuna porta esposta
                                         ├── mongo  (MongoDB 7, volume mongo_data)
                                         └── redis  (Redis 7, volume redis_data)
```

- **Frontend**: non cambia niente, continui con `build-frontend-filezilla.sh` + FileZilla.
- **Backend**: **push su `develop`** → la CI esegue i test del backend e, se passano, rilascia su Plesk
  (job `deploy-backend` in `.github/workflows/ci.yml`). In alternativa, a mano dal Mac: `./scripts/release-backend-plesk.sh`.
  Entrambi caricano il codice via SSH, ricostruiscono il container sul server e aspettano l'health check.
- **Database**: MongoDB gira in un container sullo stesso server. Il backup è un cron notturno sul server.

Il codice del progetto sul server sta in **`/opt/site-sallaku`**, **mai dentro `httpdocs/`**:
la web root è pubblica e `.env.plesk` (con tutti i segreti) sarebbe scaricabile da chiunque.

---

## Ordine dei passi

| # | Dove | Cosa | Il sito live cambia? |
|---|------|------|----------------------|
| 1 | Server | Docker e cartella del progetto | No |
| 2 | Mac → Server | Carica il codice e crea `.env.plesk` | No |
| 3 | Server | Avvia mongo + redis + backend | No |
| 3b | GitHub | Rilascio automatico a ogni push su `develop` | No |
| 4 | Pannello Plesk | Proxy nginx `/api/` e `/socket.io/` | No (il frontend chiama ancora Railway) |
| 5 | Mac → Server | **Cutover**: copia dei dati + frontend su `/api/v1` | **Sì** |
| 6 | Server / Railway | Backup cron, spegnimento Railway | No |

I passi 1–4 si possono fare con calma, anche in giorni diversi: finché il frontend punta a
Railway, il backend su Plesk gira "in parallelo" e nessun visitatore lo usa.

---

## 1. Prepara il server (una volta sola)

```bash
ssh root@gentsallaku.it        # o l'utente sudo che usi

# Docker (se `docker compose version` non risponde già)
curl -fsSL https://get.docker.com | sh
docker compose version

# RAM: il build del backend usa fino a ~3 GB. Con meno di 4 GB totali aggiungi swap:
free -h
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

mkdir -p /opt/site-sallaku
```

> In alternativa a `get.docker.com` puoi usare **Plesk → Estensioni → Docker**, che installa lo stesso motore.

## 2. Carica il codice e crea `.env.plesk`

Sul Mac, nella root del progetto, crea `.env.deploy` (è in `.gitignore`):

```bash
PLESK_SSH=root@gentsallaku.it
PLESK_DIR=/opt/site-sallaku
```

Poi carica il codice senza avviare niente:

```bash
./scripts/release-backend-plesk.sh --upload-only
```

**`.env.plesk`**: il modo più sicuro per non dimenticare variabili (chiavi AI, Google, Twilio, SMTP...)
è partire da quelle che oggi usa Railway:

```bash
# Sul Mac (se serve prima: railway login)
railway variables --service portfolio-backend --kv > /tmp/railway.env
scp /tmp/railway.env root@gentsallaku.it:/opt/site-sallaku/.env.plesk
rm /tmp/railway.env
```

Sul server sistemalo con `nano /opt/site-sallaku/.env.plesk`:

- **togli** `RAILWAY_*`, `PORT`, `MONGODB_URI` e `REDIS_URL` (li imposta `docker-compose.plesk.yml`);
- **cambia** `PUBLIC_API_URL=https://gentsallaku.it/api/v1`;
- verifica che ci sia `GROQ_API_KEY`: senza, il backend si rifiuta di partire;
- controlla che ci siano `CORS_ORIGIN=https://gentsallaku.it,https://www.gentsallaku.it` e `FRONTEND_URL=https://gentsallaku.it`;
- **consigliato**: genera un nuovo `JWT_SECRET` (`openssl rand -base64 48`), perché quello vecchio è finito nella history git.
  Effetto collaterale: chi è loggato dovrà rifare il login.

```bash
chmod 600 /opt/site-sallaku/.env.plesk
```

> Senza Railway CLI c'è `./scripts/server-setup.sh`: chiede SMTP/admin e genera il JWT. Però scrive
> solo le variabili base, e quelle delle funzioni AI/Google vanno aggiunte a mano.

## 3. Avvia il backend sul server

Dal Mac:

```bash
./scripts/release-backend-plesk.sh
```

Il comando carica il codice e lancia `scripts/deploy-plesk-backend.sh` sul server. Quello fa il build dell'immagine, avvia
`mongo`, `redis` e `backend` e aspetta che `http://127.0.0.1:3000/api/v1/system/health` risponda.
Alla fine il controllo pubblico su `https://gentsallaku.it/api/...` fallirà: è normale, il proxy non esiste ancora.

Il database a questo punto è **vuoto**: all'avvio il backend crea solo l'utente admin da `.env.plesk`. I dati veri arrivano al passo 5.

## 3b. Rilascio automatico a ogni push su `develop`

Una volta che il passo 3 funziona a mano, attiva il deploy dalla CI.

```bash
# Sul Mac: coppia di chiavi usata SOLO dalla CI
ssh-keygen -t ed25519 -N "" -C "github-deploy" -f ~/.ssh/plesk_deploy
ssh-copy-id -i ~/.ssh/plesk_deploy.pub root@gentsallaku.it
ssh-keyscan gentsallaku.it          # output → secret PLESK_KNOWN_HOSTS
cat ~/.ssh/plesk_deploy             # chiave privata → secret PLESK_SSH_KEY
```

Su GitHub, in **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valore |
|------|------|--------|
| Variable | `PLESK_SSH` | `root@gentsallaku.it` |
| Variable | `PLESK_DIR` | `/opt/site-sallaku` (facoltativa, è il default) |
| Secret | `PLESK_SSH_KEY` | contenuto di `~/.ssh/plesk_deploy` |
| Secret | `PLESK_KNOWN_HOSTS` | output di `ssh-keyscan` |

Da quel momento, a ogni push su `develop`:

1. la CI esegue build e test del backend;
2. se passano, e il push tocca `backend/`, `docker-compose.plesk.yml` o `scripts/deploy-plesk-backend.sh`,
   il job **Deploy backend (Plesk)** rilascia: carica il codice, ricostruisce il backend, aggiorna se serve
   le immagini di MongoDB/Redis e aspetta l'health check;
3. un push di solo frontend non riavvia niente.

I dati di MongoDB vivono nel volume `mongo_data` e sopravvivono a ogni rilascio. Finché `PLESK_SSH` non è
impostata il job viene saltato, senza errori.

> Finché Railway è collegato a `develop`, ogni push rilascia **anche** lì. Non fa danni: il sito usa
> il backend a cui punta il frontend. Scollegalo al passo 6.

## 4. Proxy nginx nel pannello Plesk

1. **Plesk → Siti web e domini → gentsallaku.it → Apache & nginx Settings**.
2. Controlla che **"Proxy mode"** di nginx sia attivo. Oggi le risposte riportano `Server: Apache`: se nella pagina
   non trovi il campo "Additional nginx directives", nginx è disattivato a livello server
   (**Strumenti e impostazioni → Servizi** oppure **Aggiornamenti → Componenti → Web hosting → nginx**).
3. In **"Additional nginx directives"** incolla il contenuto di
   [`plesk-nginx-directives.conf`](plesk-nginx-directives.conf): contiene `/api/` e `/socket.io/`.
   Il secondo blocco serve alla chat live: senza, il WebSocket non si collega.
4. OK, poi verifica dal Mac:

```bash
curl -s https://gentsallaku.it/api/v1/system/health
# deve restituire JSON ({"ok":true,"service":"portfolio-backend",...}), NON l'HTML di index.html
```

Il resto del sito (pagine, asset, `.htaccess`) continua a essere servito da `httpdocs/` come prima.

## 5. Cutover

Da qui in poi il traffico vero passa su Plesk. Conviene farlo in un momento tranquillo, in un'unica sessione.

### 5a. Copia i dati da Railway (subito prima dello switch)

```bash
# Sul Mac: la stessa MONGODB_URI che oggi usa il backend su Railway. Se punta a un host interno
# (*.railway.internal) usa la URI pubblica del servizio MongoDB (Variables → MONGO_PUBLIC_URL).
# Il database deve essere portfolio_prod.
MONGO_URI="mongodb://...@HOST:PORTA/portfolio_prod?authSource=admin" ./scripts/mongo-dump.sh
scp backups/mongo-backup-*.archive.gz root@gentsallaku.it:/opt/site-sallaku/backups/

# Sul server: importa portfolio_prod → portfolio (chiede conferma, sostituisce le collezioni)
cd /opt/site-sallaku
./scripts/plesk-mongo-restore.sh backups/mongo-backup-AAAAMMGG-HHMMSS.archive.gz
```

`mongo-dump.sh` usa `mongodump` in un container Docker sul Mac, quindi serve colima/Docker Desktop acceso.
Il restore stampa il numero di documenti per collezione: confrontalo con Railway.

### 5b. Punta il frontend a `/api/v1`

Va fatto **nello stesso momento**, mai prima del passo 4 verificato. L'ultima volta che `apiUrl` è diventato
relativo senza proxy attivo, login e POST sono rimasti rotti per settimane.

File da aggiornare (URL Railway → relativo o `https://gentsallaku.it`):

| File | Cosa |
|------|------|
| `frontend/src/environments/environment.prod.ts` | `apiUrl: '/api/v1'` |
| `frontend/ngsw-config.json` | `dataGroups` con URL Railway → `/api/v1/...` |
| `frontend/public/.htaccess` | CSP: togli Railway da `connect-src`/`frame-src` (`'self'` copre anche `wss://` dello stesso host) |
| `frontend/src/app/app.routes.server.ts`, `scripts/generate-sitemap.js`, `scripts/generate-rss.js`, `scripts/prefetch-blog-posts.js` | default `https://gentsallaku.it/api/v1` |
| `backend/src/newsletter/campaigns/newsletter-campaigns.service.ts` | default di `PUBLIC_API_URL` |

Poi build e upload FileZilla come sempre (`./scripts/build-frontend-filezilla.sh`). Verifica **da una finestra
in incognito** (il service worker in cache può mascherare errori):

- login admin (POST, non va in cache: è il test che conta);
- invio di un messaggio dal form contatti;
- chat live: "Vuoi parlare con Gent?" → il socket si connette;
- upload di un PDF in un tool `/lab`.

**Rollback**: ripristina `apiUrl` all'URL Railway e ricarica il frontend. Railway è ancora acceso, finché non lo spegni al passo 6.

## 6. Dopo il cutover

```bash
# Sul server: backup notturno alle 03:00
crontab -e
0 3 * * * /opt/site-sallaku/scripts/plesk-mongo-backup-cron.sh >> /var/log/mongo-backup.log 2>&1
```

Configura anche `RCLONE_REMOTE` per avere una copia fuori dal server (vedi l'intestazione dello script).
Senza, un guasto del disco porta via sia il DB sia i backup.

Dopo 1–2 settimane senza problemi:

1. **Railway**: scollega l'auto-deploy dal branch `develop`, poi elimina i servizi backend e MongoDB.
   Finché resta collegato, ogni push su `develop` continua a ridistribuire lì, e il frontend non lo usa più.
2. Disattiva `.github/workflows/mongo-backup.yml`: punta al Mongo di Railway.
3. Rimuovi dal repo `Dockerfile` e `railway.json` in root, `backend/railway.json`, `backend/nixpacks.toml`.
4. Ruota le credenziali finite nella history git: Gmail App Password, password admin
   (vedi `scripts/server-setup.sh` nella history).

---

## Rilasci di tutti i giorni

| Cosa | Comando (dal Mac) |
|------|-------------------|
| Backend + DB | `git push` su `develop` (automatico), oppure `./scripts/release-backend-plesk.sh` |
| Frontend | `./scripts/build-frontend-filezilla.sh` + upload FileZilla |

Lo script del backend rilascia solo codice committato (con modifiche locali si ferma, salvo `ALLOW_DIRTY=1`)
e scrive sul server, in `/opt/site-sallaku/.release`, quale commit è in produzione.

## Comandi utili sul server

```bash
cd /opt/site-sallaku
C="docker compose -f docker-compose.plesk.yml"

$C ps                          # stato dei container
$C logs -f backend             # log in tempo reale
$C up -d backend               # applica modifiche a .env.plesk (restart da solo NON le rilegge)
cat .release                   # commit attualmente in produzione

./scripts/plesk-mongo-backup-cron.sh                                  # backup manuale
SOURCE_DB=portfolio ./scripts/plesk-mongo-restore.sh backups/xxx.gz   # ripristino da un backup del server
$C exec mongo mongosh portfolio                                       # shell Mongo

$C pull mongo redis && $C up -d mongo redis    # aggiornamenti di sicurezza delle immagini
```

### Frontend SSR (alternativa, non in uso)

Il servizio `frontend` in `docker-compose.plesk.yml` (Angular SSR sulla porta 4000) parte solo con
`--profile ssr`. Per usarlo al posto di `httpdocs/` servirebbe anche una `location /` verso `127.0.0.1:4000`
nelle direttive nginx.
