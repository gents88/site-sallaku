// ─────────────────────────────────────────────────────────────
//  pm2 — processi del backend sul server Plesk (utente di dominio, senza root)
//
//  mongod e backend girano come processi dell'utente di dominio, gestiti da
//  pm2: li riavvia se vanno in crash, e watchdog.sh (cron ogni minuto) li
//  rialza dopo un riavvio del server.
//
//  Vive in ~/app/bin/ sul server, caricato da release-backend-plesk.sh.
// ─────────────────────────────────────────────────────────────

const APP = `${process.env.HOME}/app`;

module.exports = {
  apps: [
    {
      name: 'mongod',
      script: `${APP}/mongodb/bin/mongod`,
      args: `--config ${APP}/mongod.conf`,
      interpreter: 'none',
      autorestart: true,
      restart_delay: 5000,
      // Shutdown pulito di WiredTiger: non uccidere mongod dopo 1.6 s (default pm2)
      kill_timeout: 30000,
    },
    {
      name: 'backend',
      // Symlink alla release attiva: un restart dopo lo switch parte dalla nuova
      cwd: `${APP}/backend/current`,
      script: 'dist/main.js',
      interpreter: '/opt/plesk/node/24/bin/node',
      // Il server ha 1.8 GB di RAM senza swap, condivisi con Plesk e mongod.
      // A riposo il backend sta sui ~450 MB: ~200 MB di heap + i ~110 MB del
      // database di geoip-lite caricato in memoria + librerie native.
      node_args: '--max-old-space-size=384',
      max_memory_restart: '560M',
      env: { NODE_ENV: 'production' },
      autorestart: true,
      restart_delay: 3000,
      kill_timeout: 10000,
    },
  ],
};
