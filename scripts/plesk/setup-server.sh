#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  setup-server.sh — Prima installazione di MongoDB + pm2 sul server Plesk
#
#  Gira come UTENTE DI DOMINIO (niente root, niente Docker): tutto vive in
#  ~/app, cioè /var/www/vhosts/gentsallaku.it/app — fuori da httpdocs, quindi
#  mai raggiungibile dal web.
#
#    ~/app/mongodb/      binari mongod          ~/app/mongo-data/   dati
#    ~/app/mongo-tools/  mongodump/restore      ~/app/backups/      dump notturni
#    ~/app/tools/        pm2 + mongosh          ~/app/shared/       .env e credenziali (600)
#    ~/app/backend/      releases/<id> + current → release attiva
#
#  Idempotente: rilanciarlo aggiorna versioni e crontab senza toccare i dati.
#  Lo lancia release-backend-plesk.sh --setup dal Mac.
# ─────────────────────────────────────────────────────────────

set -euo pipefail

MONGO_VERSION=8.0.32      # stessa versione di Railway
TOOLS_VERSION=100.16.1
MONGOSH_VERSION=2.12.0
PM2_VERSION=7.0.4

# shellcheck source=env.sh
source "$(dirname "$0")/env.sh"

mkdir -p "$APP"/{bin,mongodb,mongo-tools,mongo-data,backups,incoming,shared/tessdata,backend/releases,logs}
chmod 700 "$APP" "$APP/shared"

# ── MongoDB ───────────────────────────────────────
if ! "$APP/mongodb/bin/mongod" --version 2>/dev/null | grep -q "v${MONGO_VERSION}"; then
  echo "→ Scarico MongoDB ${MONGO_VERSION}..."
  rm -rf "$APP/mongodb" && mkdir -p "$APP/mongodb"
  curl -fsSL "https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2404-${MONGO_VERSION}.tgz" \
    | tar xz -C "$APP/mongodb" --strip-components=1
fi

if ! "$APP/mongo-tools/bin/mongodump" --version 2>/dev/null | grep -q "${TOOLS_VERSION}"; then
  echo "→ Scarico MongoDB Database Tools ${TOOLS_VERSION}..."
  rm -rf "$APP/mongo-tools" && mkdir -p "$APP/mongo-tools"
  curl -fsSL "https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2404-x86_64-${TOOLS_VERSION}.tgz" \
    | tar xz -C "$APP/mongo-tools" --strip-components=1
fi

# ── pm2 + mongosh ─────────────────────────────────
echo "→ pm2 ${PM2_VERSION} + mongosh ${MONGOSH_VERSION}..."
npm install --prefix "$APP/tools" --no-audit --no-fund --loglevel=error \
  "pm2@${PM2_VERSION}" "mongosh@${MONGOSH_VERSION}"

# ── Configurazione mongod ─────────────────────────
cat > "$APP/mongod.conf" <<EOF
# Generato da setup-server.sh — modifiche manuali vengono sovrascritte
storage:
  dbPath: ${APP}/mongo-data
  wiredTiger:
    engineConfig:
      # RAM del server: 1.8 GB senza swap, condivisi con Plesk e il backend
      cacheSizeGB: 0.25
net:
  bindIp: 127.0.0.1
  port: 27017
security:
  authorization: enabled
setParameter:
  diagnosticDataCollectionEnabled: false
EOF

# ── Credenziali MongoDB (generate una volta sola) ─
CREDS="$APP/shared/mongo.env"
if [[ ! -f "$CREDS" ]]; then
  umask 077
  cat > "$CREDS" <<EOF
MONGO_ROOT_USER=root
MONGO_ROOT_PASS=$(openssl rand -hex 24)
MONGO_APP_USER=portfolio
MONGO_APP_PASS=$(openssl rand -hex 24)
EOF
  umask 022
fi
# shellcheck disable=SC1090
source "$CREDS"

# ── Avvio mongod ──────────────────────────────────
pm2_has mongod || pm2 start "$ECOSYSTEM" --only mongod
echo "⏳ Attendo mongod..."
for _ in $(seq 1 30); do
  mongosh --quiet --norc "mongodb://127.0.0.1:27017/admin" --eval 'db.runCommand({ping:1}).ok' &>/dev/null && break
  sleep 2
done

ROOT_URI="mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASS}@127.0.0.1:27017/admin"

# Primo utente via "localhost exception": finché non esistono utenti permette
# SOLO createUser (nemmeno getUsers), quindi prima si prova il login come root.
if ! mongosh --quiet --norc "$ROOT_URI" --eval 'db.runCommand({connectionStatus:1}).ok' &>/dev/null; then
  mongosh --quiet --norc "mongodb://127.0.0.1:27017/admin" --eval "
    db.createUser({ user: '${MONGO_ROOT_USER}', pwd: '${MONGO_ROOT_PASS}', roles: ['root'] });
    print('creato utente ${MONGO_ROOT_USER}');"
fi

mongosh --quiet --norc "$ROOT_URI" --eval "
  if (!db.getUser('${MONGO_APP_USER}')) {
    db.createUser({ user: '${MONGO_APP_USER}', pwd: '${MONGO_APP_PASS}', roles: [{ role: 'readWrite', db: 'portfolio' }] });
    print('creato utente ${MONGO_APP_USER}');
  }"

pm2 save --force >/dev/null

# Niente pm2-logrotate: occupa ~75 MB di RAM. I log li ruota mongo-backup.sh ogni notte.
pm2 describe pm2-logrotate &>/dev/null && pm2 uninstall pm2-logrotate >/dev/null

# ── Crontab ───────────────────────────────────────
# Rimuove le righe gestite da questo script (e il vecchio controllo docker che
# scriveva docker-check.txt nella web root), poi le riscrive.
{
  crontab -l 2>/dev/null | grep -v -e '/app/bin/' -e 'docker-check' || true
  echo "@reboot ${APP}/bin/watchdog.sh >> ${APP}/logs/watchdog.log 2>&1"
  echo "* * * * * ${APP}/bin/watchdog.sh >> ${APP}/logs/watchdog.log 2>&1"
  echo "30 3 * * * ${APP}/bin/mongo-backup.sh >> ${APP}/logs/mongo-backup.log 2>&1"
} | crontab -

echo ""
echo "✅ Setup completato."
mongod --version | head -1
pm2 ls
