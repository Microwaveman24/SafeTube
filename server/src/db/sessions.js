'use strict';
/**
 * Server-side sessions for the parent dashboard. Tokens are random 256-bit
 * values stored hashed? No — stored as-is but they are unguessable
 * (crypto.randomBytes(32)); the sessions table is only readable by the
 * server process. Expired sessions are pruned on login and periodically.
 */

const crypto = require('crypto');
const db = require('./index');
const { config } = require('../config');

const stmtInsert = db.prepare(
  'INSERT INTO sessions (token, parent_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
);
const stmtGet = db.prepare('SELECT * FROM sessions WHERE token = ?');
const stmtDelete = db.prepare('DELETE FROM sessions WHERE token = ?');
const stmtDeleteParent = db.prepare('DELETE FROM sessions WHERE parent_id = ?');
const stmtPrune = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

function prune() {
  stmtPrune.run(new Date().toISOString());
}

function create(parentId) {
  prune();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionTtlMs);
  stmtInsert.run(token, parentId, now.toISOString(), expires.toISOString());
  return { token, expiresAt: expires };
}

function get(token) {
  if (!token) return null;
  const row = stmtGet.get(token);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    stmtDelete.run(token);
    return null;
  }
  return row;
}

function destroy(token) {
  if (token) stmtDelete.run(token);
}

function destroyAllForParent(parentId) {
  stmtDeleteParent.run(parentId);
}

module.exports = { create, get, destroy, destroyAllForParent, prune };
