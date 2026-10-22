# Backend + MongoDB su Plesk (addio Railway)

## Come funziona

```
Browser ──HTTPS──▶ Apache di Plesk (gentsallaku.it)
                     ├── /api/*, /socket.io/*  ──proxy (.htaccess)──▶ 127.0.0.1:3000  backend NestJS
                     └── tutto il resto ─────────────────────────────▶ httpdocs/        Angular statico
                                                                            │
                                                                     127.0.0.1:27017  MongoDB 8.0
```

Tutto gira con l'**utente di dominio** `gentsallaku.it_wdv9je9vcto`: **niente root e niente Docker**.
Il nostro account Plesk non è amministratore, e sul server non ci sono né nginx né Docker.

| Cosa | Dove sul server |
|------|-----------------|
| Backend (release attiva) | `~/app/backend/current` → `~/app/backend/releases/<data>-<commit>` |
| MongoDB 8.0.32 (binari / dati) | `~/app/mongodb` / `~/app/mongo-data` |
| `.env` del backend, credenziali Mongo | `~/app/shared/backend.env`, `~/app/shared/mongo.env` (permessi 600) |
| Backup notturni | `~/app/backups` |
| Script (copiati da `scripts/plesk/` a ogni rilascio) | `~/app/bin` |

`~` è `/var/www/vhosts/gentsallaku.it`. `~/app` sta **fuori da `httpdocs/`**, quindi non è mai raggiungibile dal web.

- **Processi**: `pm2` tiene accesi `mongod` e `backend` e li riavvia se vanno in crash.
  Senza root non c'è systemd: un cron ogni minuto (`watchdog.sh`) li rialza anche dopo un riavvio del server.
- **Proxy**: le regole in cima a `frontend/public/.htaccess` mandano `/api` e `/socket.io` al backend.
  Viaggiano con il frontend: qualunque upload di `httpdocs/` deve includere quel `.htaccess`.
- **RAM**: il server ha 1,8 GB, senza swap e condivisi con Plesk. Per questo MongoDB è limitato a 256 MB
  di cache, il backend a ~480 MB (pm2 lo riavvia oltre questa soglia) e il server **non compila mai**:
  il bundle arriva già compilato.

---

## Rilasciare

| Cosa | Come |
|------|------|
| **Backend** | **push su `develop`**: la CI esegue i test, compila il bundle e lo attiva sul server (job `deploy-backend`) |
| Backend, a mano dal Mac | `./scripts/release-backend-plesk.sh` (serve colima/Docker acceso: compila in un container Linux) |
| **Frontend** | **push su `main`**: la CI esegue unit test, build ed e2e e carica la build in `httpdocs/` con rsync (job `deploy-frontend`) |
| Frontend, a mano dal Mac | `cd frontend && npm run build:prod && cd .. && ./scripts/release-frontend-plesk.sh` (oppure, come prima, `./scripts/build-frontend-filezilla.sh` + upload FileZilla) |
| Database | non si rilascia: i dati restano in `~/app/mongo-data` tra un rilascio e l'altro |

Il rilascio carica il bundle, lo estrae in una nuova cartella `releases/`, collega `.env`, sposta `current`,
riavvia e aspetta `/api/v1/system/health`. **Se il nuovo backend non risponde entro 3 minuti torna da solo
alla release precedente.** Restano le ultime 5 release.

Il rilascio del frontend carica prima gli asset, poi le pagine e il `.htaccess`, per ultimo `ngsw.json`
(il service worker). Non cancella i chunk delle build precedenti, così chi ha il sito aperto non trova file
mancanti; cancella solo le copie `.br`/`.gz` che la build non contiene, perché Apache le servirebbe al
posto delle pagine nuove. Poi controlla che `/` e `/about` carichino il nuovo `main-*.js` e che
`/api/v1/system/health` risponda: altrimenti rimette il `.htaccess` precedente e il job fallisce.
Per tornare a una versione precedente: GitHub Actions → la CI di quel commit su `main` → *Re-run all jobs*.

### Configurazione della CI (una volta)

Su GitHub, in **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valore |
|------|------|--------|
| Secret | `PLESK_SSH_KEY` | contenuto di `~/.ssh/plesk_deploy_ci` sul Mac (chiave già autorizzata sul server) |
| Secret | `PLESK_KNOWN_HOSTS` | output di `ssh-keyscan -t ed25519 212.227.39.180` |
| Variable | `PLESK_SSH` | `gentsallaku.it_wdv9je9vcto@212.227.39.180` |

Finché `PLESK_SSH` non è impostata, i job di deploy (backend e frontend) vengono saltati senza errori.

```bash
cd ~/projects/site-sallaku
ssh-keyscan -t ed25519 212.227.39.180 2>/dev/null | gh secret set PLESK_KNOWN_HOSTS
gh secret set PLESK_SSH_KEY < ~/.ssh/plesk_deploy_ci
gh variable set PLESK_SSH --body 'gentsallaku.it_wdv9je9vcto@212.227.39.180'
```

Per il Mac basta `.env.deploy` (in `.gitignore`) con `PLESK_SSH=plesk-gentsallaku`: è l'alias in `~/.ssh/config`
che usa la chiave `~/.ssh/plesk_gentsallaku`.

---

## Prima installazione (già fatta il 2026-10-16)

```bash
./scripts/release-backend-plesk.sh --setup
```

Lancia sul server `scripts/plesk/setup-server.sh`, che è idempotente. Lo script:
- scarica MongoDB e i database tools;
- installa pm2 e mongosh in `~/app/tools`;
- genera le credenziali Mongo e crea gli utenti `root` e `portfolio`;
- installa il crontab: watchdog ogni minuto e al reboot, backup alle 03:30, controllo della memoria ogni 5 minuti.

Rilanciarlo serve ad aggiornare le versioni (in cima allo script).

`~/app/shared/backend.env` si crea dalle variabili di Railway, con `MONGODB_URI` che punta al Mongo locale
(credenziali in `~/app/shared/mongo.env`) e `PUBLIC_API_URL=https://gentsallaku.it/api/v1`.

---

## Cutover da Railway (fatto il 2026-10-16)

Stato dopo il cutover: il sito usa solo Plesk. Il backend su Railway è fermo (`railway down`) e scollegato da
GitHub (`railway service source disconnect`), quindi i push non lo ridistribuiscono più. Anche il MongoDB
di Railway è fermo (`railway down`): il volume con i dati del cutover resta collegato al servizio, e si
riaccende con un redeploy dal pannello. Il workflow `mongo-backup.yml`, che faceva il backup di quel
database, è disattivato su GitHub (`gh workflow disable`). Ultimi dump sul Mac in `backups/railway-*`.

Passi eseguiti, utili come riferimento per un eventuale ritorno indietro:

1. **Dati**: dump di `portfolio_prod` da Railway, upload in `~/app/incoming/` e ripristino con
   `~/app/bin/mongo-restore.sh <file> portfolio_prod`. Lo script stampa i documenti per collezione:
   confrontali con Railway.
2. **Email**: durante la prova in parallelo `backend.env` non ha `RESEND_API_KEY`, `SMTP_USER` e `SMTP_PASS`,
   e `PING_SITEMAP=false`, così i due backend non mandano email doppie. Al cutover vanno aggiunti, e il servizio
   backend su Railway va fermato: altrimenti i suoi cron (riepilogo delle 22, newsletter) continuano a girare
   sul vecchio DB.
3. **Frontend** su `/api/v1`, con build e upload. Verifica da una finestra in incognito, perché il service
   worker può mascherare errori: login admin, form contatti, chat live, upload PDF in `/lab`.

| File | Modifica |
|------|----------|
| `frontend/src/environments/environment.prod.ts` | `apiUrl: '/api/v1'` |
| `frontend/ngsw-config.json` | `dataGroups` con URL Railway → `/api/v1/...` |
| `frontend/public/.htaccess` | CSP: Railway fuori da `connect-src`/`frame-src` (`'self'` copre anche `wss://` dello stesso host) |
| `frontend/src/app/app.routes.server.ts`, `scripts/generate-sitemap.js`, `scripts/generate-rss.js`, `scripts/prefetch-blog-posts.js` | default `https://gentsallaku.it/api/v1` |
| `backend/src/newsletter/campaigns/newsletter-campaigns.service.ts` | default di `PUBLIC_API_URL` |

**Rollback**:
1. Ricollega e riavvia Railway: `railway service source connect` sul repo `gents88/site-sallaku`,
   branch `develop`, oppure un redeploy dal pannello.
2. Ripristina `apiUrl` e la CSP con l'URL di Railway, poi ricompila e ricarica il frontend.
3. I dati scritti su Plesk dopo il cutover vanno riportati su Railway con un dump di `portfolio` e un
   restore in `portfolio_prod`.

Dopo 1–2 settimane senza problemi:
- elimina i servizi su Railway (backend e MongoDB, dopo un ultimo dump di sicurezza);
- disattiva `.github/workflows/mongo-backup.yml`;
- rimuovi `Dockerfile`, `railway.json`, `backend/railway.json` e `backend/nixpacks.toml`.

---

## Comandi utili (sul server: `ssh plesk-gentsallaku`)

```bash
source ~/app/bin/env.sh            # PATH con node, pm2, mongosh, mongodump

pm2 ls                             # stato di mongod e backend
pm2 logs backend --lines 100       # log del backend
pm2 restart backend --update-env   # dopo aver modificato ~/app/shared/backend.env
cat ~/app/logs/watchdog.log        # riavvii fatti dal watchdog

ls -lt ~/app/backend/releases/     # release disponibili
~/app/bin/mongo-backup.sh          # backup manuale
~/app/bin/mongo-verify-backup.sh   # prova il ripristino dell'ultimo dump in un database temporaneo (non tocca portfolio)
~/app/bin/memory-alert.sh --test   # invia subito l'email di prova dell'avviso memoria (--dry-run: solo a video)
~/app/bin/mongo-restore.sh ~/app/backups/<file> portfolio   # ripristino da un backup del server

source ~/app/shared/mongo.env      # shell Mongo
mongosh "mongodb://$MONGO_ROOT_USER:$MONGO_ROOT_PASS@127.0.0.1:27017/portfolio?authSource=admin"
```

---

## Backup e monitoraggio

| Cosa | Dove | Quando |
|------|------|--------|
| Dump del database sul server | `~/app/backups` (ultimi 14 giorni) | ogni notte 03:30 UTC (cron, `mongo-backup.sh`) |
| Copia **cifrata** fuori dal server | artifact del workflow **MongoDB Backup** su GitHub (30 giorni) | ogni notte 04:15 UTC |
| Controllo che il sito sia online | workflow **Uptime**: pagine, backend, database, scadenza HTTPS | ogni 15 minuti |

Se un controllo fallisce, GitHub manda un'email (Settings → Notifications → Actions). Il workflow di backup
fallisce anche se sul server non c'è un dump delle ultime 26 ore.

Il repository è pubblico, quindi gli artifact vengono cifrati con [age](https://age-encryption.org)
usando la chiave pubblica scritta nel workflow. **La chiave privata esiste solo in
`~/.config/age/gentsallaku-backup.key` sul Mac: conservane una copia nel gestore di password**, senza quella
i backup su GitHub non si possono aprire.

Ripristino da GitHub (es. server perso):

```bash
gh run list --workflow mongo-backup.yml --limit 5          # scegli una run riuscita
gh run download <run-id> --dir backups/                    # scarica l'artifact .age
age -d -i ~/.config/age/gentsallaku-backup.key backups/<nome>/<file>.archive.gz.age > backups/ripristino.archive.gz
scp backups/ripristino.archive.gz plesk-gentsallaku:app/incoming/
ssh plesk-gentsallaku '~/app/bin/mongo-restore.sh ~/app/incoming/ripristino.archive.gz portfolio'
```

---

## Variante Docker (solo con accesso root)

Se un giorno avrai l'accesso root (password di root da IONOS o login admin in Plesk), il repo ha anche la
versione container: `docker-compose.plesk.yml` (MongoDB + Redis + backend), `scripts/server-setup.sh`,
`scripts/deploy-plesk-backend.sh`, `scripts/plesk-mongo-*.sh` e le direttive nginx in
`docs/guides/plesk-nginx-directives.conf`. Con root si potrebbe aggiungere anche swap e Redis.
