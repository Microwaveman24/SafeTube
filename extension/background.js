/**
 * SafeTube — background service worker (Manifest V3).
 *
 * Responsibilities:
 *  - Keep a cached copy of the parent-approved video whitelist AND channel
 *    whitelist (chrome.storage.local).
 *  - Refresh them every 60 seconds via chrome.alarms (service workers can't rely on setInterval).
 *  - Proxy backend API calls for the content script (single place for auth + settings).
 *  - Remember video IDs approved during this session so the child isn't re-blocked
 *    on the same video after the parent approves it.
 *  - TAMPER DETECTION: register this browser as a device and send a heartbeat
 *    every few minutes. If the extension is disabled/removed, heartbeats stop
 *    and the parent server emails the parent after a quiet period.
 *
 * FAIL-CLOSED: if the backend can't be reached and there is no cached whitelist,
 * every API call rejects and the content script shows a blocking overlay.
 */
'use strict';

const CACHE_KEY = 'tg_whitelistCache';   // { videoIds: string[], updatedAt: number }
const CHANNEL_CACHE_KEY = 'tg_channelCache'; // { channelIds: string[], updatedAt: number }
const APPROVED_KEY = 'tg_sessionApproved'; // string[] — approved this session, not yet on server whitelist
const DEVICE_ID_KEY = 'tg_deviceId';     // stable per-browser device identifier
const REFRESH_ALARM = 'tg-refresh-whitelist';
const HEARTBEAT_ALARM = 'tg-heartbeat';
const STALE_AFTER_MS = 60 * 1000;

/* ---------------- settings + low-level API ---------------- */

async function getSettings() {
  const s = await chrome.storage.local.get(['tg_baseUrl', 'tg_familyKey', 'tg_childName']);
  return {
    baseUrl: String(s.tg_baseUrl || 'http://localhost:3000').replace(/\/+$/, ''),
    familyKey: s.tg_familyKey || '',
    childName: s.tg_childName || ''
  };
}

/** Fetch JSON from the parent server, throwing on network or non-2xx errors. */
async function apiFetch(path, opts = {}) {
  const { baseUrl, familyKey } = await getSettings();
  const res = await fetch(baseUrl + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-Family-Key': familyKey,
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error('Backend responded HTTP ' + res.status + ' for ' + path);
  // Some endpoints may return an empty body; tolerate that.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

/* ---------------- device identity + heartbeat ---------------- */

/** Stable per-browser device ID, created once and kept in local storage. */
async function getDeviceId() {
  const stored = await chrome.storage.local.get(DEVICE_ID_KEY);
  if (stored[DEVICE_ID_KEY]) return stored[DEVICE_ID_KEY];
  const id = (crypto.randomUUID ? crypto.randomUUID() : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  await chrome.storage.local.set({ [DEVICE_ID_KEY]: id });
  return id;
}

async function registerDevice() {
  try {
    const deviceId = await getDeviceId();
    const { childName } = await getSettings();
    await apiFetch('/api/devices/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId, childName })
    });
  } catch (e) {
    // Registration is best-effort; the heartbeat will retry it via auto-register.
  }
}

async function sendHeartbeat() {
  try {
    const deviceId = await getDeviceId();
    const { childName } = await getSettings();
    await apiFetch('/api/devices/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ deviceId, childName })
    });
  } catch (e) {
    // Heartbeat failures are silent — the server-side watchdog is what
    // notices and alerts. The next alarm retries.
  }
}

/* ---------------- whitelist cache ---------------- */

function updateBadge(count) {
  try {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  } catch (e) { /* action API unavailable — non-fatal */ }
}

/**
 * Return the video + channel whitelists, refreshing from the server when the
 * cache is stale. Falls back to a stale cache if the server is unreachable;
 * throws only when there is no usable data at all (caller must fail closed).
 */
async function getWhitelist() {
  const stored = await chrome.storage.local.get([CACHE_KEY, CHANNEL_CACHE_KEY, APPROVED_KEY]);
  const cache = stored[CACHE_KEY];
  const channelCache = stored[CHANNEL_CACHE_KEY];
  const approved = stored[APPROVED_KEY] || [];

  const cacheFresh = cache && (Date.now() - cache.updatedAt) < STALE_AFTER_MS;
  if (cacheFresh) {
    return {
      videoIds: cache.videoIds,
      channelIds: (channelCache && channelCache.channelIds) || [],
      approved,
      fresh: true,
    };
  }

  try {
    const [videos, channels] = await Promise.all([
      apiFetch('/api/whitelist'),
      apiFetch('/api/channel-whitelist').catch(() => ({ channelIds: [] })),
    ]);
    const videoIds = Array.isArray(videos.videoIds) ? videos.videoIds : [];
    const channelIds = Array.isArray(channels.channelIds) ? channels.channelIds : [];
    await chrome.storage.local.set({
      [CACHE_KEY]: { videoIds, updatedAt: Date.now() },
      [CHANNEL_CACHE_KEY]: { channelIds, updatedAt: Date.now() },
    });
    updateBadge(videoIds.length);
    return { videoIds, channelIds, approved, fresh: true };
  } catch (e) {
    if (cache) {
      return {
        videoIds: cache.videoIds,
        channelIds: (channelCache && channelCache.channelIds) || [],
        approved,
        fresh: false,
      };
    }
    throw new Error('Cannot reach the parent server and no cached whitelist exists.');
  }
}

/** Force a refresh (used by the periodic alarm, options page, and content script). */
async function refreshWhitelist() {
  try {
    const [videos, channels] = await Promise.all([
      apiFetch('/api/whitelist'),
      apiFetch('/api/channel-whitelist').catch(() => ({ channelIds: [] })),
    ]);
    const videoIds = Array.isArray(videos.videoIds) ? videos.videoIds : [];
    const channelIds = Array.isArray(channels.channelIds) ? channels.channelIds : [];
    await chrome.storage.local.set({
      [CACHE_KEY]: { videoIds, updatedAt: Date.now() },
      [CHANNEL_CACHE_KEY]: { channelIds, updatedAt: Date.now() },
    });
    updateBadge(videoIds.length);
    return { ok: true, count: videoIds.length, channels: channelIds.length };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function rememberApproved(videoId) {
  const stored = await chrome.storage.local.get(APPROVED_KEY);
  const list = stored[APPROVED_KEY] || [];
  if (!list.includes(videoId)) {
    list.push(videoId);
    await chrome.storage.local.set({ [APPROVED_KEY]: list });
  }
}

/* ---------------- message router (content script -> background) ---------------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'getWhitelist':
        return await getWhitelist();

      case 'refreshWhitelist':
        return await refreshWhitelist();

      case 'getDeviceId':
        return { deviceId: await getDeviceId() };

      case 'requestApproval': {
        // POST /api/requests {videoId, title, url, childName, channelId, channelTitle} -> 201 {id, status:"pending"}
        const { childName } = await getSettings();
        const data = await apiFetch('/api/requests', {
          method: 'POST',
          body: JSON.stringify({
            videoId: msg.videoId,
            title: msg.title || '',
            url: msg.url || '',
            childName: childName || '',
            channelId: msg.channelId || '',
            channelTitle: msg.channelTitle || ''
          })
        });
        if (!data.id) throw new Error('Server did not return a request id.');
        return { id: data.id, status: data.status || 'pending' };
      }

      case 'checkRequest': {
        // GET /api/requests/{id} -> {id, status: pending|approved|denied}
        const data = await apiFetch('/api/requests/' + encodeURIComponent(msg.requestId));
        return { id: data.id, status: data.status };
      }

      case 'markApproved':
        await rememberApproved(msg.videoId);
        return { ok: true };

      default:
        throw new Error('Unknown message type: ' + msg.type);
    }
  })()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true; // keep the message channel open for the async response
});

/* ---------------- periodic work ---------------- */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) refreshWhitelist();
  if (alarm.name === HEARTBEAT_ALARM) sendHeartbeat();
});

function ensureAlarms() {
  chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 3 });
  refreshWhitelist();
  registerDevice().then(() => sendHeartbeat());
}

chrome.runtime.onInstalled.addListener(ensureAlarms);
chrome.runtime.onStartup.addListener(ensureAlarms);
