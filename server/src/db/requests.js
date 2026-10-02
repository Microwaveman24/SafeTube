'use strict';
/** Video-approval requests. */

const db = require('./index');

const stmtInsert = db.prepare(`
  INSERT INTO requests (videoId, title, url, childName, child_id, channelId, channelTitle, status, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
`);
const stmtGet = db.prepare('SELECT * FROM requests WHERE id = ?');
const stmtSetStatus = db.prepare('UPDATE requests SET status = ? WHERE id = ?');

function create({ videoId, title, url, childName, childId, channelId, channelTitle }) {
  const info = stmtInsert.run(
    videoId,
    title || '',
    url || '',
    childName || '',
    childId == null ? null : childId,
    channelId || '',
    channelTitle || '',
    new Date().toISOString()
  );
  return { id: info.lastInsertRowid, status: 'pending' };
}

function toJson(r) {
  return {
    id: r.id,
    videoId: r.videoId,
    title: r.title,
    url: r.url,
    childName: r.childName,
    childId: r.child_id == null ? null : r.child_id,
    channelId: r.channelId || '',
    channelTitle: r.channelTitle || '',
    status: r.status,
    createdAt: r.createdAt,
  };
}

function get(id) {
  const row = stmtGet.get(id);
  return row ? toJson(row) : null;
}

function list(status, childId) {
  const s = !status || status === 'all' ? null : status;
  if (s && !['pending', 'approved', 'denied'].includes(s)) {
    throw Object.assign(new Error('status must be pending, approved, denied, or all'), { statusCode: 400 });
  }
  const conds = [];
  const params = [];
  if (s) {
    conds.push('status = ?');
    params.push(s);
  }
  if (childId !== undefined && childId !== null && childId !== '') {
    conds.push('child_id = ?');
    params.push(Number(childId));
  }
  const sql = `SELECT * FROM requests${conds.length ? ' WHERE ' + conds.join(' AND ') : ''} ORDER BY createdAt DESC`;
  return db.prepare(sql).all(...params).map(toJson);
}

function setStatus(id, status) {
  stmtSetStatus.run(status, id);
}

module.exports = { create, get, list, setStatus };
