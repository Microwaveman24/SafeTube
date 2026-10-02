'use strict';
/**
 * Child devices. Each browser running the extension registers a stable
 * device_id and sends heartbeats. The tamper monitor (services/monitor.js)
 * watches last_seen_at and raises alerts when a device goes quiet.
 */

const db = require('./index');

const stmtUpsert = db.prepare(`
  INSERT INTO devices (device_id, child_name, child_id, last_seen_at, created_at, alert_state, last_alert_at)
  VALUES (?, ?, ?, ?, ?, 0, NULL)
  ON CONFLICT(device_id) DO UPDATE SET
    child_name = excluded.child_name,
    child_id = COALESCE(excluded.child_id, devices.child_id),
    last_seen_at = excluded.last_seen_at
`);
const stmtHeartbeat = db.prepare(`
  UPDATE devices
  SET last_seen_at = ?, alert_state = 0
  WHERE device_id = ?
`);
const stmtAll = db.prepare('SELECT * FROM devices ORDER BY child_name ASC, created_at ASC');
const stmtStale = db.prepare(`
  SELECT * FROM devices
  WHERE last_seen_at IS NOT NULL
    AND last_seen_at < ?
    AND (last_alert_at IS NULL OR last_alert_at < ?)
  ORDER BY last_seen_at ASC
`);
const stmtMarkAlerted = db.prepare(
  'UPDATE devices SET alert_state = 1, last_alert_at = ? WHERE device_id = ?'
);
const stmtDelete = db.prepare('DELETE FROM devices WHERE device_id = ?');

function register(deviceId, childName, childId) {
  const now = new Date().toISOString();
  stmtUpsert.run(deviceId, childName || '', childId == null ? null : childId, now, now);
  return get(deviceId);
}

function heartbeat(deviceId) {
  const info = stmtHeartbeat.run(new Date().toISOString(), deviceId);
  return info.changes > 0;
}

function get(deviceId) {
  return db.prepare('SELECT * FROM devices WHERE device_id = ?').get(deviceId) || null;
}

function all() {
  return stmtAll.all().map(toJson);
}

/** Devices quieter than `staleBefore` whose last alert is older than `cooldownBefore`. */
function staleDevices(staleBefore, cooldownBefore) {
  return stmtStale.all(staleBefore.toISOString(), cooldownBefore.toISOString()).map(toJson);
}

function markAlerted(deviceId) {
  stmtMarkAlerted.run(new Date().toISOString(), deviceId);
}

function remove(deviceId) {
  stmtDelete.run(deviceId);
}

function toJson(r) {
  return {
    deviceId: r.device_id,
    childId: r.child_id == null ? null : r.child_id,
    childName: r.child_name || '',
    lastSeenAt: r.last_seen_at,
    createdAt: r.created_at,
    alerted: r.alert_state === 1,
    lastAlertAt: r.last_alert_at,
  };
}

module.exports = { register, heartbeat, get, all, staleDevices, markAlerted, remove, toJson };
