'use strict';
/**
 * Centralized configuration. Every tunable comes from the environment with a
 * sane default; misconfiguration fails fast with a clear message at boot.
 *
 * See .env.example for documentation of each variable.
 */

const path = require('path');

function int(name, def, min = 1) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min) {
    throw new Error(`[config] ${name} must be an integer >= ${min} (got "${raw}")`);
  }
  return n;
}

function str(name, def = '') {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? def : raw;
}

function bool(name, def = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

const config = {
  port: int('PORT', 3000),
  dbPath: str('DB_PATH', path.join(__dirname, '..', 'safetube.db')),

  // Credential the child's extension uses to talk to the parent API.
  familyKey: str('FAMILY_KEY', ''),

  // Tamper detection: a device that hasn't sent a heartbeat in this long
  // is considered possibly-tampered and the parent is emailed.
  tamperAlertAfterMinutes: int('TAMPER_ALERT_AFTER_MINUTES', 30),
  // Minimum gap between repeat alerts for the same device.
  alertCooldownHours: int('ALERT_COOLDOWN_HOURS', 12),
  // How often the watchdog scans for stale devices.
  monitorIntervalMinutes: int('MONITOR_INTERVAL_MINUTES', 5),

  // Email (SMTP) for tamper alerts. If SMTP_HOST is unset, alerts are logged
  // and surfaced in the dashboard but no email is sent.
  smtp: {
    host: str('SMTP_HOST', ''),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: str('SMTP_USER', ''),
    pass: str('SMTP_PASS', ''),
    from: str('SMTP_FROM', ''),
  },
  // Where alert emails go. Defaults to the parent account's email address.
  alertEmail: str('ALERT_EMAIL', ''),

  youtubeApiKey: str('YOUTUBE_API_KEY', ''),

  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  bcryptRounds: int('BCRYPT_ROUNDS', 12, 4),
  cookieSecure: bool('COOKIE_SECURE', false),

  isDev: str('NODE_ENV', 'production') !== 'production',
};

function validate(cfg) {
  if (!cfg.familyKey) {
    throw new Error(
      '[config] FAMILY_KEY is required. Set it to a long random secret shared with the child\'s extension.'
    );
  }
  if (cfg.familyKey.length < 12) {
    throw new Error('[config] FAMILY_KEY must be at least 12 characters long.');
  }
}

module.exports = { config, validate };
