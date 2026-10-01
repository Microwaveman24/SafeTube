'use strict';
/** Video-approval requests. */

const db = require('./index');

const stmtInsert = db.prepare(`
  INSERT INTO requests (videoId, title, url, childName, channelId, channelTitle, status, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
`);
const stmtGet = db.prepare('SELECT * FROM requests WHERE id = ?');
const stmtByStatus = db.prepare('SELECT * FROM requests WHERE status = ? ORDER BY createdAt DESC');
const stmtAll = db.prepare('SELECT * FROM requests ORDER BY createdAt DESC');
const stmtSetStatus = db.prepare('UPDATE requests SET status = ? WHERE id = ?');
const stmtChildStats = db.prepare(`
  SELECT childName AS name,
         COUNT(*) AS requests,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
  FROM requests
  GROUP BY childName
  ORDER BY name ASC
`);

function create({ videoId, title, url, childName, channelId, channelTitle }) {
  const info = stmtInsert.run(
    videoId,
    title || '',
    url || '',
    childName || '',
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

function list(status) {
  if (!status || status === 'all') return stmtAll.all().map(toJson);
  if (!['pending', 'approved', 'denied'].includes(status)) {
    throw Object.assign(new Error('status must be pending, approved, denied, or all'), { statusCode: 400 });
  }
  return stmtByStatus.all(status).map(toJson);
}

function setStatus(id, status) {
  stmtSetStatus.run(status, id);
}

function childStats() {
  return stmtChildStats.all().map((r) => ({
    name: r.name || '(unnamed)',
    requests: r.requests,
    pending: r.pending,
  }));
}

module.exports = { create, get, list, setStatus, childStats };
