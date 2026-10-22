#!/usr/bin/env node
/**
 * Wrapper di `ng build` che stampiglia nel bundle la versione del rilascio:
 * commit git e ora di build (fuso Europe/Rome), mostrati nel footer del sito
 * (vedi frontend/src/app/core/utils/build-info.ts).
 *
 * Passa per `--define` invece di scrivere un file generato: così non resta
 * nessun file modificato nel working tree dopo la build.
 *
 * Uso (da frontend/): node ../scripts/ng-build.js [argomenti di ng build]
 *   es. node ../scripts/ng-build.js --configuration production
 *
 * Se il working tree ha modifiche non committate il commit riceve il suffisso
 * "+": il rilascio non corrisponde esattamente a quel commit.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');

const frontend = path.join(__dirname, '..', 'frontend');

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: frontend, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const sha = process.env.BUILD_COMMIT || git('rev-parse --short HEAD') || 'unknown';
const dirty = !process.env.BUILD_COMMIT && git('status --porcelain') !== '';
const commit = dirty ? `${sha}+` : sha;

const parts = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]),
);
const time = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;

console.log(`[ng-build] rilascio ${commit} · ${time}`);

const result = spawnSync(
  'npx',
  ['ng', 'build', ...process.argv.slice(2),
    '--define', `__BUILD_COMMIT__='${commit}'`,
    '--define', `__BUILD_TIME__='${time}'`],
  { cwd: frontend, stdio: 'inherit', shell: process.platform === 'win32' },
);
if (result.status === 0) {
  // CSP senza 'unsafe-inline' per gli script: gli hash si conoscono solo a build finita (vedi
  // scripts/csp-hashes.js, che in caso di dubbio lascia il .htaccess com'è).
  const hashes = spawnSync(
    process.execPath,
    [path.join(__dirname, 'csp-hashes.js'), path.join(frontend, 'dist', 'portfolio-frontend', 'browser')],
    { stdio: 'inherit' },
  );
  if (hashes.status !== 0) console.warn('[ng-build] csp-hashes non riuscito: il .htaccess resta com\'è.');
}
process.exit(result.status ?? 1);
