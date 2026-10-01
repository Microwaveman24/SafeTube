'use strict';
/**
 * Database connection, schema, and lightweight migrations.
 *
 * All SQL lives behind the modules in this directory (parents, sessions,
 * devices, requests, whitelists). Nothing outside src/db/ talks to
 * better-sqlite3 directly, so the store can later be swapped (e.g. for
 * Postgres) by re-implementing these modules behind the same function
 * signatures.
 */

const Database = require('better-sqlite3');
const logger = require('../logger');
const { config } = require('../config');

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS parents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    parent_id  INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

  CREATE TABLE IF NOT EXISTS devices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id    TEXT NOT NULL UNIQUE,
    child_name   TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT,
    created_at   TEXT NOT NULL,
    alert_state  INTEGER NOT NULL DEFAULT 0,
    last_alert_at TEXT
  );

  CREATE TABLE IF NOT EXISTS requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    videoId      TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    url          TEXT NOT NULL DEFAULT '',
    childName    TEXT NOT NULL DEFAULT '',
    channelId    TEXT NOT NULL DEFAULT '',
    channelTitle TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending',
    createdAt    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
  CREATE INDEX IF NOT EXISTS idx_requests_child ON requests(childName);

  CREATE TABLE IF NOT EXISTS whitelist (
    videoId TEXT PRIMARY KEY,
    addedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channel_whitelist (
    channelId TEXT PRIMARY KEY,
    title     TEXT NOT NULL DEFAULT '',
    addedAt   TEXT NOT NULL
  );

  -- Kept for backward compatibility with pre-2.0 databases.
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Backfill columns for databases created by older versions.
function ensureColumn(table, column, ddl) {
  const exists = db
    .prepare(`SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?`)
    .get(table, column).n;
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    logger.info(`[db] Backfilled ${table}.${column}`);
  }
}

ensureColumn('requests', 'channelId', 'channelId TEXT NOT NULL DEFAULT \'\'');
ensureColumn('requests', 'channelTitle', 'channelTitle TEXT NOT NULL DEFAULT \'\'');
ensureColumn('devices', 'alert_state', 'alert_state INTEGER NOT NULL DEFAULT 0');
ensureColumn('devices', 'last_alert_at', 'last_alert_at TEXT');

logger.info(`[db] Opened ${config.dbPath}`);

module.exports = db;
