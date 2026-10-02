'use strict';
/** Per-child video whitelist and channel whitelist. */

const db = require('./index');

const now = () => new Date().toISOString();

// --- videos ---
const stmtVideoAdd = db.prepare(
  'INSERT OR IGNORE INTO whitelist (child_id, videoId, addedAt) VALUES (?, ?, ?)'
);
const stmtVideoDel = db.prepare('DELETE FROM whitelist WHERE child_id = ? AND videoId = ?');
const stmtVideoAll = db.prepare(
  'SELECT videoId, addedAt FROM whitelist WHERE child_id = ? ORDER BY addedAt ASC'
);

const videos = {
  add(childId, videoId) {
    stmtVideoAdd.run(childId, videoId, now());
  },
  remove(childId, videoId) {
    stmtVideoDel.run(childId, videoId);
  },
  allIds(childId) {
    return stmtVideoAll.all(childId).map((r) => r.videoId);
  },
};

// --- channels ---
const stmtChannelAdd = db.prepare(
  'INSERT OR IGNORE INTO channel_whitelist (child_id, channelId, title, addedAt) VALUES (?, ?, ?, ?)'
);
const stmtChannelDel = db.prepare(
  'DELETE FROM channel_whitelist WHERE child_id = ? AND channelId = ?'
);
const stmtChannelAll = db.prepare(
  'SELECT channelId, title, addedAt FROM channel_whitelist WHERE child_id = ? ORDER BY addedAt ASC'
);

const channels = {
  add(childId, channelId, title) {
    stmtChannelAdd.run(childId, channelId, title || '', now());
  },
  remove(childId, channelId) {
    stmtChannelDel.run(childId, channelId);
  },
  all(childId) {
    return stmtChannelAll.all(childId).map((r) => ({
      channelId: r.channelId,
      title: r.title,
      addedAt: r.addedAt,
    }));
  },
  allIds(childId) {
    return stmtChannelAll.all(childId).map((r) => r.channelId);
  },
};

module.exports = { videos, channels };
