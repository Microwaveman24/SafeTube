'use strict';
/**
 * Parent accounts. Passwords are hashed with bcrypt (via bcryptjs, pure JS).
 * The very first parent is created through the one-time setup flow; after
 * that, setup is closed.
 */

const bcrypt = require('bcryptjs');
const db = require('./index');
const { config } = require('../config');

const stmtCount = db.prepare('SELECT COUNT(*) AS n FROM parents');
const stmtFirstId = db.prepare('SELECT id FROM parents LIMIT 1');
const stmtByEmail = db.prepare('SELECT * FROM parents WHERE email = ?');
const stmtById = db.prepare('SELECT * FROM parents WHERE id = ?');
const stmtInsert = db.prepare(
  'INSERT INTO parents (email, password_hash, created_at) VALUES (?, ?, ?)'
);
const stmtUpdatePw = db.prepare('UPDATE parents SET password_hash = ? WHERE id = ?');
const stmtAllEmails = db.prepare('SELECT email FROM parents ORDER BY id ASC');

function count() {
  return stmtCount.get().n;
}

/** The single parent's id (this server supports exactly one parent account). */
function firstId() {
  const row = stmtFirstId.get();
  return row ? row.id : null;
}

function setupRequired() {
  return count() === 0;
}

async function createParent(email, password) {
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const info = stmtInsert.run(email.toLowerCase().trim(), hash, new Date().toISOString());
  return { id: info.lastInsertRowid, email: email.toLowerCase().trim() };
}

async function verifyCredentials(email, password) {
  const row = stmtByEmail.get(String(email || '').toLowerCase().trim());
  if (!row || !password) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  return ok ? { id: row.id, email: row.email } : null;
}

async function changePassword(parentId, currentPassword, newPassword) {
  const row = stmtById.get(parentId);
  if (!row) return false;
  const ok = await bcrypt.compare(currentPassword, row.password_hash);
  if (!ok) return false;
  const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
  stmtUpdatePw.run(hash, parentId);
  return true;
}

function allEmails() {
  return stmtAllEmails.all().map((r) => r.email);
}

function sanitize(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

function byId(id) {
  return sanitize(stmtById.get(id));
}

module.exports = {
  count,
  firstId,
  setupRequired,
  createParent,
  verifyCredentials,
  changePassword,
  allEmails,
  byId,
};
