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

  -- Child profiles (v4.1+). One parent manages multiple children; devices,
  -- requests, and whitelists all belong to a child.
  CREATE TABLE IF NOT EXISTS children (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id  INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(parent_id, name)
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

// v4.1: link devices/requests to child profiles.
ensureColumn('devices', 'child_id', 'child_id INTEGER REFERENCES children(id) ON DELETE CASCADE');
ensureColumn('requests', 'child_id', 'child_id INTEGER REFERENCES children(id) ON DELETE CASCADE');

function tableHasColumn(table, column) {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM pragma_table_info(?) WHERE name = ?')
      .get(table, column).n > 0
  );
}

function firstParentId() {
  const row = db.prepare('SELECT id FROM parents LIMIT 1').get();
  return row ? row.id : null;
}

/**
 * v4.1 backfill: create one child profile per distinct non-empty child name
 * found on devices/requests, then link rows by case-insensitive name match.
 * Idempotent — safe to run on every boot.
 */
function backfillChildren() {
  const parentId = firstParentId();
  if (!parentId) {
    logger.info('[db] No parent account yet — skipping children backfill (children will be created on demand).');
    return;
  }

  const names = new Map(); // lower(name) -> original casing
  for (const table of ['devices', 'requests']) {
    const col = table === 'devices' ? 'child_name' : 'childName';
    const rows = db
      .prepare(`SELECT DISTINCT ${col} AS name FROM ${table} WHERE ${col} IS NOT NULL AND TRIM(${col}) <> ''`)
      .all();
    for (const r of rows) {
      const name = String(r.name).trim();
      if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }
  }

  const stmtInsert = db.prepare(
    'INSERT OR IGNORE INTO children (parent_id, name, created_at) VALUES (?, ?, ?)'
  );
  let created = 0;
  const now = new Date().toISOString();
  for (const name of names.values()) {
    if (stmtInsert.run(parentId, name, now).changes) created++;
  }

  const linkDevices = db.prepare(`
    UPDATE devices
    SET child_id = (SELECT id FROM children WHERE parent_id = ? AND lower(name) = lower(TRIM(devices.child_name)) LIMIT 1)
    WHERE child_id IS NULL AND child_name IS NOT NULL AND TRIM(child_name) <> ''
  `);
  const linkRequests = db.prepare(`
    UPDATE requests
    SET child_id = (SELECT id FROM children WHERE parent_id = ? AND lower(name) = lower(TRIM(requests.childName)) LIMIT 1)
    WHERE child_id IS NULL AND childName IS NOT NULL AND TRIM(childName) <> ''
  `);
  const linkedDevices = linkDevices.run(parentId).changes;
  const linkedRequests = linkRequests.run(parentId).changes;
  if (created || linkedDevices || linkedRequests) {
    logger.info(
      `[db] Children backfill: ${created} child profile(s) created, ` +
        `${linkedDevices} device(s) and ${linkedRequests} request(s) linked.`
    );
  }
}

/**
 * v4.1 migration: convert a global whitelist table to the per-child shape
 * (child_id, key, ...). Every old row is copied once per child (cross join).
 * Runs inside a transaction; idempotent.
 */
function migrateGlobalTable(table, copyCols, newTableDdl) {
  if (tableHasColumn(table, 'child_id')) return; // already migrated

  const parentId = firstParentId();
  const oldCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  if (oldCount > 0) {
    if (parentId) {
      const childCount = db
        .prepare('SELECT COUNT(*) AS n FROM children WHERE parent_id = ?')
        .get(parentId).n;
      if (childCount === 0) {
        db.prepare('INSERT INTO children (parent_id, name, created_at) VALUES (?, ?, ?)')
          .run(parentId, 'My child', new Date().toISOString());
        logger.info('[db] Created default child "My child" to receive migrated whitelist rows.');
      }
    } else {
      // Practically unreachable (writes require a parent), but never leave
      // the table in the old shape: modules prepare against the new shape.
      logger.warn(
        `[db] ${table} has ${oldCount} row(s) but no parent account exists; ` +
          'they cannot be assigned to a child and will be dropped.'
      );
    }
  }

  const selectCols = ['c.id', ...copyCols.map((c) => `w.${c}`)].join(', ');
  const doMigrate = db.transaction(() => {
    db.exec(newTableDdl);
    db.prepare(
      `INSERT INTO ${table}_new (child_id, ${copyCols.join(', ')}) ` +
        `SELECT ${selectCols} FROM ${table} w CROSS JOIN children c`
    ).run();
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
  });
  doMigrate();

  const newCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  logger.info(
    `[db] Migrated ${table} to per-child shape (${oldCount} old row(s) → ${newCount} row(s)).`
  );
}

backfillChildren();
migrateGlobalTable(
  'whitelist',
  ['videoId', 'addedAt'],
  `CREATE TABLE whitelist_new (
     child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
     videoId TEXT NOT NULL,
     addedAt TEXT NOT NULL,
     PRIMARY KEY(child_id, videoId)
   )`
);
migrateGlobalTable(
  'channel_whitelist',
  ['channelId', 'title', 'addedAt'],
  `CREATE TABLE channel_whitelist_new (
     child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
     channelId TEXT NOT NULL,
     title TEXT NOT NULL DEFAULT '',
     addedAt TEXT NOT NULL,
     PRIMARY KEY(child_id, channelId)
   )`
);

logger.info(`[db] Opened ${config.dbPath}`);

module.exports = db;
