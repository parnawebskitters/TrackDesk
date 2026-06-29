const fs = require('node:fs');
const path = require('node:path');

loadDotEnv(path.resolve(__dirname, '../../.env'));
loadDotEnv(path.resolve(process.cwd(), '.env'));

const DEFAULTS = {
  apiBaseUrl: process.env.LARAVEL_API_BASE_URL || process.env.API_BASE_URL || 'http://127.0.0.1:8000/api/v1',
  apiTimeoutMs: Number(process.env.API_TIMEOUT_MS || 15000),
  syncIntervalSeconds: Number(process.env.SYNC_INTERVAL_SECONDS || 60),
  timerPersistIntervalSeconds: Number(process.env.TIMER_PERSIST_INTERVAL_SECONDS || 5),
  adminExitPassword: process.env.ADMIN_EXIT_PASSWORD || 'change-this-admin-password'
};

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }
}

module.exports = { DEFAULTS };
