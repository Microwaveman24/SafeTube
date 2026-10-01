'use strict';
/** Video whitelist and channel whitelist. */

const db = require('./index');

const now = () => new Date().toISOString();

// --- videos ---
const stmtVideoAdd = db.prepare('INSERT OR IGNORE INTO whitelist (videoId, addedAt) VALUES (?, ?)');
const stmtVideoDel = db.prepare('DELETE FROM whitelist WHERE videoId = ?');
const stmtVideoAll = db.prepare('SELECT videoId, addedAt FROM whitelist ORDER BY addedAt ASC');

const videos = {
  add(videoId) {
    stmtVideoAdd.run(videoId, now());
  },
  remove(videoId) {
    stmtVideoDel.run(videoId);
  },
  allIds() {
    return stmtVideoAll.all().map((r) => r.videoId);
  },
};

// --- channels ---
const stmtChannelAdd = db.prepare(
  'INSERT OR IGNORE INTO channel_whitelist (channelId, title, addedAt) VALUES (?, ?, ?)'
);
const stmtChannelDel = db.prepare('DELETE FROM channel_whitelist WHERE channelId = ?');
const stmtChannelAll = db.prepare('SELECT channelId, title, addedAt FROM channel_whitelist ORDER BY addedAt ASC');

const channels = {
  add(channelId, title) {
    stmtChannelAdd.run(channelId, title || '', now());
  },
  remove(channelId) {
    stmtChannelDel.run(channelId);
  },
  all() {
    return stmtChannelAll.all().map((r) => ({
      channelId: r.channelId,
      title: r.title,
      addedAt: r.addedAt,
    }));
  },
  allIds() {
    return stmtChannelAll.all().map((r) => r.channelId);
  },
};

module.exports = { videos, channels };
