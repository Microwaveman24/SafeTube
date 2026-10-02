'use strict';
/**
 * Child profiles. One parent manages multiple children; devices, requests,
 * and whitelists all belong to a child.
 */

const db = require('./index');

function bad(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function cleanName(name) {
  const v = String(name === undefined || name === null ? '' : name).trim();
  if (!v) throw bad('name is required');
  if (v.length > 100) throw bad('name is too long (max 100 chars)');
  return v;
}

const stmtList = db.prepare(`
  SELECT c.id, c.parent_id, c.name, c.created_at,
         (SELECT COUNT(*) FROM devices d WHERE d.child_id = c.id) AS device_count,
         (SELECT COUNT(*) FROM requests r WHERE r.child_id = c.id) AS total_requests,
         (SELECT COUNT(*) FROM requests r WHERE r.child_id = c.id AND r.status = 'pending') AS pending_requests,
         (SELECT COUNT(*) FROM whitelist w WHERE w.child_id = c.id) AS video_count,
         (SELECT COUNT(*) FROM channel_whitelist cw WHERE cw.child_id = c.id) AS channel_count
  FROM children c
  WHERE c.parent_id = ?
  ORDER BY c.name ASC
`);
const stmtGet = db.prepare('SELECT * FROM children WHERE id = ?');
const stmtFindByName = db.prepare(
  'SELECT * FROM children WHERE parent_id = ? AND lower(name) = lower(?) LIMIT 1'
);
const stmtInsert = db.prepare(
  'INSERT INTO children (parent_id, name, created_at) VALUES (?, ?, ?)'
);
const stmtRename = db.prepare('UPDATE children SET name = ? WHERE id = ?');
const stmtDelete = db.prepare('DELETE FROM children WHERE id = ?');

function toJson(r) {
  if (!r) return null;
  const out = {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    createdAt: r.created_at,
  };
  if (r.device_count !== undefined) {
    out.deviceCount = r.device_count;
    out.totalRequests = r.total_requests;
    out.pendingRequests = r.pending_requests;
    out.videoCount = r.video_count;
    out.channelCount = r.channel_count;
  }
  return out;
}

function list(parentId) {
  return stmtList.all(parentId).map(toJson);
}

function get(id) {
  const n = Number(id);
  if (!Number.isInteger(n)) return null;
  return toJson(stmtGet.get(n));
}

function uniqueViolation(err) {
  return err && err.message && err.message.includes('UNIQUE');
}

function create(parentId, name) {
  const v = cleanName(name);
  if (stmtFindByName.get(parentId, v)) {
    throw bad('a child with that name already exists');
  }
  try {
    const info = stmtInsert.run(parentId, v, new Date().toISOString());
    return get(info.lastInsertRowid);
  } catch (err) {
    if (uniqueViolation(err)) throw bad('a child with that name already exists');
    throw err;
  }
}

function rename(id, name) {
  const v = cleanName(name);
  const row = stmtGet.get(Number(id));
  if (!row) return null;
  const clash = stmtFindByName.get(row.parent_id, v);
  if (clash && clash.id !== row.id) {
    throw bad('a child with that name already exists');
  }
  try {
    stmtRename.run(v, row.id);
  } catch (err) {
    if (uniqueViolation(err)) throw bad('a child with that name already exists');
    throw err;
  }
  return get(row.id);
}

function remove(id) {
  const info = stmtDelete.run(Number(id));
  return info.changes > 0;
}

/**
 * Find a child by (case-insensitive) name for this parent, creating it when
 * missing. Blank names resolve to a shared '(unnamed)' child.
 */
function resolveOrCreate(parentId, name) {
  const v = String(name === undefined || name === null ? '' : name).trim() || '(unnamed)';
  const existing = stmtFindByName.get(parentId, v);
  if (existing) return toJson(existing);
  return create(parentId, v);
}

module.exports = { list, get, create, rename, remove, resolveOrCreate, toJson };
