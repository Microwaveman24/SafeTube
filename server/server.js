/**
 * SafeTube parent server.
 *
 * Receives video-approval requests from the child's Chrome extension,
 * stores them in SQLite, and serves the parent dashboard at /.
 *
 * Extension API — every /api/* route (except /api/auth/login|logout)
 * requires the header:  X-Family-Key: <FAMILY_KEY>
 *
 * Optional hardening (see README.md):
 *  - PARENT_PASSWORD: when set, the dashboard pages require a parent login
 *    (session cookie). The extension API keeps using X-Family-Key only.
 *  - YOUTUBE_API_KEY: when set, the server enriches approval requests with
 *    the video title / channel from the YouTube Data API when the extension
 *    didn't supply them. Everything works fine without it.
 */
'use strict';

const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const FAMILY_KEY = process.env.FAMILY_KEY || 'changeme123';
const PARENT_PASSWORD = process.env.PARENT_PASSWORD || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'safetube.db');
const SESSION_COOKIE = 'st_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

if (!process.env.FAMILY_KEY) {
  console.warn('[safetube] WARNING: FAMILY_KEY not set — using default "changeme123". Change it!');
}
if (PARENT_PASSWORD) {
  console.log('[safetube] Parent-password login is ENABLED for the dashboard.');
} else {
  console.warn('[safetube] PARENT_PASSWORD not set — dashboard has no login. Set it to lock the dashboard.');
}
if (!YOUTUBE_API_KEY) {
  console.log('[safetube] YOUTUBE_API_KEY not set — requests will use the title/channel sent by the extension.');
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
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
  CREATE TABLE IF NOT EXISTS whitelist (
    videoId TEXT PRIMARY KEY,
    addedAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS channel_whitelist (
    channelId TEXT PRIMARY KEY,
    title     TEXT NOT NULL DEFAULT '',
    addedAt   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token     TEXT PRIMARY KEY,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
  CREATE INDEX IF NOT EXISTS idx_requests_child ON requests(childName);
`);

// Backfill columns for databases created by older versions.
for (const col of ['channelId', 'channelTitle']) {
  const exists = db.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('requests') WHERE name = ?`).get(col).n;
  if (!exists) db.exec(`ALTER TABLE requests ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
}

const stmtInsertRequest = db.prepare(
  'INSERT INTO requests (videoId, title, url, childName, channelId, channelTitle, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const stmtGetRequest = db.prepare('SELECT * FROM requests WHERE id = ?');
const stmtUpdateStatus = db.prepare('UPDATE requests SET status = ? WHERE id = ?');
const stmtWhitelistAdd = db.prepare('INSERT OR IGNORE INTO whitelist (videoId, addedAt) VALUES (?, ?)');
const stmtWhitelistDel = db.prepare('DELETE FROM whitelist WHERE videoId = ?');
const stmtWhitelistAll = db.prepare('SELECT videoId, addedAt FROM whitelist ORDER BY addedAt ASC');
const stmtChannelAdd = db.prepare('INSERT OR IGNORE INTO channel_whitelist (channelId, title, addedAt) VALUES (?, ?, ?)');
const stmtChannelDel = db.prepare('DELETE FROM channel_whitelist WHERE channelId = ?');
const stmtChannelAll = db.prepare('SELECT channelId, title, addedAt FROM channel_whitelist ORDER BY addedAt ASC');
const stmtSessionAdd = db.prepare('INSERT INTO sessions (token, createdAt) VALUES (?, ?)');
const stmtSessionGet = db.prepare('SELECT * FROM sessions WHERE token = ?');
const stmtSessionDel = db.prepare('DELETE FROM sessions WHERE token = ?');
const stmtSettingGet = db.prepare('SELECT value FROM settings WHERE key = ?');
const stmtSettingSet = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

// ---------------------------------------------------------------------------
// Parent password (dashboard login) — scrypt hash, salt persisted in settings
// ---------------------------------------------------------------------------
function getPwRecord() {
  const row = stmtSettingGet.get('parent_pw');
  return row ? JSON.parse(row.value) : null;
}
function setPwRecord(rec) {
  stmtSettingSet.run('parent_pw', JSON.stringify(rec));
}
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
// If PARENT_PASSWORD is set but no hash is stored yet, hash and store it now.
// If the env password changes later, re-hash on next boot (lets parents rotate it).
if (PARENT_PASSWORD) {
  const rec = getPwRecord();
  const probe = rec ? hashPassword(PARENT_PASSWORD, rec.salt) : null;
  if (!rec || !crypto.timingSafeEqual(Buffer.from(probe, 'hex'), Buffer.from(rec.hash, 'hex'))) {
    const salt = crypto.randomBytes(16).toString('hex');
    setPwRecord({ salt, hash: hashPassword(PARENT_PASSWORD, salt) });
    console.log('[safetube] Parent password hash stored/updated.');
  }
}
function parentPasswordSet() {
  return Boolean(PARENT_PASSWORD && getPwRecord());
}
function verifyParentPassword(password) {
  const rec = getPwRecord();
  if (!rec || !password) return false;
  const h = hashPassword(password, rec.salt);
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(rec.hash, 'hex'));
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function pruneSessions() {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  db.prepare('DELETE FROM sessions WHERE createdAt < ?').run(cutoff);
}

// ---------------------------------------------------------------------------
// YouTube Data API enrichment (optional)
// ---------------------------------------------------------------------------
async function enrichFromYouTube(videoId) {
  // Returns {title, channelId, channelTitle} or null. Never throws.
  if (!YOUTUBE_API_KEY) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const url =
      'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' +
      encodeURIComponent(videoId) + '&key=' + encodeURIComponent(YOUTUBE_API_KEY);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data && data.items && data.items[0];
    if (!item || !item.snippet) return null;
    return {
      title: item.snippet.title || '',
      channelId: item.snippet.channelId || '',
      channelTitle: item.snippet.channelTitle || '',
    };
  } catch (e) {
    return null; // enrichment is best-effort; the request still goes through
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

// Permissive CORS for /api so the extension (chrome-extension:// origin)
// can call the API without host-permission quirks.
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Family-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- parent login endpoints (no family key needed; the dashboard uses these) ---
app.post('/api/auth/login', (req, res) => {
  if (!parentPasswordSet()) {
    return res.status(400).json({ error: 'no parent password configured on the server' });
  }
  const { password } = req.body || {};
  if (!verifyParentPassword(password)) {
    return res.status(401).json({ error: 'invalid password' });
  }
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  stmtSessionAdd.run(token, new Date().toISOString());
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL_MS });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) stmtSessionDel.run(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Auth: X-Family-Key must match FAMILY_KEY on every other /api route.
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/logout') return next();
  const key = req.get('X-Family-Key');
  if (key !== FAMILY_KEY) {
    return res.status(401).json({ error: 'unauthorized: invalid or missing X-Family-Key' });
  }
  next();
});

function rowToRequest(r) {
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

// POST /api/requests — child asks for a video to be approved
app.post('/api/requests', async (req, res) => {
  const { videoId, title, url, childName, channelId, channelTitle } = req.body || {};
  if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  let finalTitle = String(title || '');
  let finalChannelId = String(channelId || '');
  let finalChannelTitle = String(channelTitle || '');

  // Optional enrichment: fill in blanks from the YouTube Data API.
  if ((!finalTitle || !finalChannelId) && YOUTUBE_API_KEY) {
    const meta = await enrichFromYouTube(videoId.trim());
    if (meta) {
      if (!finalTitle) finalTitle = meta.title;
      if (!finalChannelId) finalChannelId = meta.channelId;
      if (!finalChannelTitle) finalChannelTitle = meta.channelTitle;
    }
  }

  const now = new Date().toISOString();
  const info = stmtInsertRequest.run(
    videoId.trim(),
    finalTitle,
    String(url || ''),
    String(childName || ''),
    finalChannelId,
    finalChannelTitle,
    'pending',
    now
  );
  res.status(201).json({ id: info.lastInsertRowid, status: 'pending' });
});

// GET /api/requests?status=pending|approved|denied|all
app.get('/api/requests', (req, res) => {
  const status = (req.query.status || 'all').toLowerCase();
  let rows;
  if (status === 'all') {
    rows = db.prepare('SELECT * FROM requests ORDER BY createdAt DESC').all();
  } else if (['pending', 'approved', 'denied'].includes(status)) {
    rows = db.prepare('SELECT * FROM requests WHERE status = ? ORDER BY createdAt DESC').all(status);
  } else {
    return res.status(400).json({ error: 'status must be pending, approved, denied, or all' });
  }
  res.json(rows.map(rowToRequest));
});

// GET /api/requests/:id — extension polls this for the decision
app.get('/api/requests/:id', (req, res) => {
  const row = stmtGetRequest.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'request not found' });
  res.json({ id: row.id, status: row.status });
});

// POST /api/requests/:id/decision — parent approves or denies.
// Body: { decision: "approved"|"denied", alsoAllowChannel?: true }
// When approving with alsoAllowChannel and the request has a channelId,
// the channel is added to the channel whitelist (all its videos allowed).
app.post('/api/requests/:id/decision', (req, res) => {
  const decision = req.body && req.body.decision;
  if (decision !== 'approved' && decision !== 'denied') {
    return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
  }
  const row = stmtGetRequest.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'request not found' });

  stmtUpdateStatus.run(decision, row.id);
  let channelAllowed = false;
  if (decision === 'approved') {
    // Idempotent: approving twice still yields one whitelist row.
    stmtWhitelistAdd.run(row.videoId, new Date().toISOString());
    if (req.body && req.body.alsoAllowChannel && row.channelId) {
      stmtChannelAdd.run(row.channelId, row.channelTitle || '', new Date().toISOString());
      channelAllowed = true;
    }
  }
  res.json({ id: row.id, status: decision, channelAllowed });
});

// GET /api/whitelist
app.get('/api/whitelist', (req, res) => {
  const rows = stmtWhitelistAll.all();
  res.json({ videoIds: rows.map((r) => r.videoId) });
});

// POST /api/whitelist — parent manually adds a video
app.post('/api/whitelist', (req, res) => {
  const { videoId } = req.body || {};
  if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
    return res.status(400).json({ error: 'videoId is required' });
  }
  stmtWhitelistAdd.run(videoId.trim(), new Date().toISOString());
  res.json({ ok: true });
});

// DELETE /api/whitelist/:videoId
app.delete('/api/whitelist/:videoId', (req, res) => {
  stmtWhitelistDel.run(req.params.videoId);
  res.json({ ok: true });
});

// GET /api/channel-whitelist — full channel records for the dashboard
app.get('/api/channel-whitelist', (req, res) => {
  const rows = stmtChannelAll.all();
  res.json({
    channels: rows.map((r) => ({ channelId: r.channelId, title: r.title, addedAt: r.addedAt })),
    channelIds: rows.map((r) => r.channelId),
  });
});

// POST /api/channel-whitelist — parent manually allows a whole channel
app.post('/api/channel-whitelist', (req, res) => {
  const { channelId, title } = req.body || {};
  if (!channelId || typeof channelId !== 'string' || !channelId.trim()) {
    return res.status(400).json({ error: 'channelId is required' });
  }
  stmtChannelAdd.run(channelId.trim(), String(title || ''), new Date().toISOString());
  res.json({ ok: true });
});

// DELETE /api/channel-whitelist/:channelId
app.delete('/api/channel-whitelist/:channelId', (req, res) => {
  stmtChannelDel.run(req.params.channelId);
  res.json({ ok: true });
});

// GET /api/children — distinct child names seen in requests, with counts.
// (Minimal "child accounts": the extension reports childName per request;
//  the old SafeTube had full JWT child accounts — see README migration notes.)
app.get('/api/children', (req, res) => {
  const rows = db.prepare(`
    SELECT childName AS name,
           COUNT(*) AS requests,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
    FROM requests
    GROUP BY childName
    ORDER BY name ASC
  `).all();
  res.json({ children: rows.map((r) => ({ name: r.name || '(unnamed)', requests: r.requests, pending: r.pending })) });
});

// ---------------------------------------------------------------------------
// Dashboard — gated by parent login when PARENT_PASSWORD is set
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next(); // API handled above
  if (!parentPasswordSet()) return next(); // no password configured: open dashboard
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const authed = token && stmtSessionGet.get(token);
  if (authed) return next();
  if (req.path === '/login.html' || req.path === '/login.js') return next();
  if (req.path === '/' || req.path === '/index.html') {
    return res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  }
  return res.status(401).json({ error: 'dashboard login required' });
});

app.use(express.static(PUBLIC_DIR));

app.listen(PORT, () => {
  console.log(`[safetube] Server running at http://localhost:${PORT}`);
  console.log(`[safetube] Dashboard: http://localhost:${PORT}/   (API at /api/...)`);
});
