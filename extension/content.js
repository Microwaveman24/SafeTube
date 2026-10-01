/**
 * SafeTube — content script (runs on youtube.com/watch* and youtube.com/shorts*).
 *
 * Flow per navigation:
 *  1. Extract the video ID from the URL (and the channel ID from page metadata).
 *  2. Ask the background worker for the cached video + channel whitelists.
 *  3. If the video is whitelisted, its channel is whitelisted, or it was
 *     approved this session: allow playback.
 *  4. Otherwise: FAIL CLOSED — pause all video elements immediately and show a
 *     full-viewport overlay. The child can request parent approval; the overlay
 *     polls the server every 15 s until the request is approved or denied.
 *
 * YouTube is a single-page app, so we re-run the check on `yt-navigate-finish`
 * plus a lightweight URL-change poll as a fallback.
 */
'use strict';

const OVERLAY_ID = 'safetube-overlay';
const POLL_INTERVAL_MS = 15000; // how often to re-check a pending approval request
const NAV_CHECK_MS = 800;       // fallback poll for SPA navigations
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const DEFAULT_BASE_URL = 'http://localhost:3000';

let settings = { baseUrl: DEFAULT_BASE_URL, familyKey: '', childName: '' };
let lastUrl = location.href;
let currentVideoId = null;
let currentChannelId = '';
let currentChannelTitle = '';
let currentRequestId = null;
let pollTimer = null;
let mediaBlocked = false;
let lastPauseSweep = 0;

/* ================= settings ================= */

async function loadSettings() {
  try {
    const s = await chrome.storage.local.get(['tg_baseUrl', 'tg_familyKey', 'tg_childName']);
    settings = {
      baseUrl: String(s.tg_baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      familyKey: s.tg_familyKey || '',
      childName: s.tg_childName || ''
    };
  } catch (e) {
    settings = { baseUrl: DEFAULT_BASE_URL, familyKey: '', childName: '' };
  }
}

// If a parent changes settings while the child is watching, re-evaluate the page.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let changed = false;
  if (changes.tg_baseUrl) {
    settings.baseUrl = String(changes.tg_baseUrl.newValue || DEFAULT_BASE_URL).replace(/\/+$/, '');
    changed = true;
  }
  if (changes.tg_familyKey) { settings.familyKey = changes.tg_familyKey.newValue || ''; changed = true; }
  if (changes.tg_childName) { settings.childName = changes.tg_childName.newValue || ''; changed = true; }
  if (changed) handleNavigation(true);
});

/* ================= background messaging ================= */

/** Send a message to the service worker; rejects on worker error or no response. */
function bg(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!resp) return reject(new Error('No response from SafeTube background worker.'));
        if (resp.ok === false) return reject(new Error(resp.error || 'Background worker error.'));
        resolve(resp);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ================= video identification ================= */

/** Extract the 11-char YouTube video ID from a watch or shorts URL; null if none. */
function getVideoId(url) {
  try {
    const u = new URL(url, location.origin);
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === '/watch') {
      const v = u.searchParams.get('v');
      return v && VIDEO_ID_RE.test(v) ? v : null;
    }
    const m = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

/** Best-effort video title: og:title meta tag first, then document.title. */
function getVideoTitle() {
  const og = document.querySelector('meta[property="og:title"]');
  if (og && og.content) return og.content;
  const t = (document.title || '').replace(/\s*-\s*YouTube\s*$/, '').trim();
  return t || 'YouTube video';
}

/** Best-effort channel title from the page's structured metadata. */
function readChannelTitle() {
  const link = document.querySelector('span[itemprop="author"] link[itemprop="name"]');
  if (link) {
    const c = link.getAttribute('content');
    if (c) return c.trim();
  }
  const el = document.querySelector('ytd-channel-name #text');
  if (el && el.textContent) return el.textContent.trim();
  return '';
}

/**
 * Extract the uploader's channel ID. YouTube renders
 * <meta itemprop="channelId" content="UC…"> on watch pages, but it may not be
 * present at document_start, so retry briefly. Media stays paused meanwhile.
 */
async function getChannelInfo() {
  for (let i = 0; i < 6; i++) {
    const meta = document.querySelector('meta[itemprop="channelId"]');
    if (meta && meta.content) {
      return { channelId: meta.content, channelTitle: readChannelTitle() };
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { channelId: '', channelTitle: '' };
}

/* ================= media blocking ================= */

function pauseAllVideos() {
  // Throttle: YouTube mutates the DOM constantly; sweeping at most ~3x/sec is plenty.
  const now = Date.now();
  if (now - lastPauseSweep < 300) return;
  lastPauseSweep = now;
  document.querySelectorAll('video').forEach((v) => {
    try { v.pause(); v.muted = true; } catch (e) { /* ignore */ }
  });
}

function playMainVideo() {
  const v = document.querySelector('video');
  if (v) {
    try { v.muted = false; } catch (e) { /* ignore */ }
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* autoplay may still be blocked; user can press play */ });
  }
}

/* ================= overlay ================= */

const OVERLAY_SKELETON = `
  <div class="tg-card">
    <div class="tg-brand">🛡️ SafeTube</div>
    <img class="tg-thumb" alt="Video thumbnail">
    <div class="tg-title"></div>
    <p class="tg-msg"></p>
    <button class="tg-ask-btn" type="button">Ask parent for approval</button>
    <button class="tg-retry-btn" type="button" style="display:none">Retry</button>
    <p class="tg-status"></p>
  </div>`;

/** Create the overlay if needed (waits for <body> when running at document_start). */
function ensureOverlay() {
  return new Promise((resolve) => {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) return resolve(existing);
    const build = () => {
      const ov = document.createElement('div');
      ov.id = OVERLAY_ID;
      ov.innerHTML = OVERLAY_SKELETON;
      ov.querySelector('.tg-ask-btn').addEventListener('click', onAskClicked);
      ov.querySelector('.tg-retry-btn').addEventListener('click', () => handleNavigation(true));
      const img = ov.querySelector('.tg-thumb');
      img.addEventListener('error', () => { img.style.display = 'none'; });
      document.body.appendChild(ov);
      resolve(ov);
    };
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build, { once: true });
  });
}

function removeOverlay() {
  const ov = document.getElementById(OVERLAY_ID);
  if (ov) ov.remove();
}

/**
 * Overlay states:
 *  blocked        — video not approved; shows "Ask parent for approval"
 *  sending        — approval request in flight
 *  waiting        — request sent; polling the server
 *  denied         — parent declined
 *  backend-down   — server unreachable (fail closed)
 *  not-configured — no family key set yet (fail closed)
 */
async function renderOverlay(state) {
  const ov = await ensureOverlay();
  const vid = currentVideoId;
  const thumb = ov.querySelector('.tg-thumb');
  thumb.style.display = '';
  thumb.src = 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg';
  ov.querySelector('.tg-title').textContent = getVideoTitle(); // textContent: no HTML injection

  const msg = ov.querySelector('.tg-msg');
  const askBtn = ov.querySelector('.tg-ask-btn');
  const retryBtn = ov.querySelector('.tg-retry-btn');
  const status = ov.querySelector('.tg-status');
  askBtn.style.display = 'none';
  retryBtn.style.display = 'none';
  status.textContent = '';

  switch (state) {
    case 'blocked':
      msg.textContent = currentChannelTitle
        ? `This video from "${currentChannelTitle}" needs a parent's approval.`
        : "This video needs a parent's approval.";
      askBtn.style.display = '';
      askBtn.disabled = false;
      askBtn.textContent = 'Ask parent for approval';
      break;
    case 'sending':
      msg.textContent = 'Sending your request…';
      askBtn.style.display = '';
      askBtn.disabled = true;
      askBtn.textContent = 'Sending…';
      break;
    case 'waiting':
      msg.textContent = 'Request sent — waiting for parent…';
      status.textContent = 'Checking for approval every 15 seconds. You can leave this page open.';
      break;
    case 'denied':
      msg.textContent = 'Parent declined this video.';
      break;
    case 'backend-down':
      msg.textContent = "Can't reach the parent server. Ask a parent to check the connection.";
      retryBtn.style.display = '';
      break;
    case 'not-configured':
      msg.textContent = 'SafeTube is not set up yet. Ask a parent to open the extension options and enter the family key.';
      break;
  }
}

const showBlocked = (vid) => renderOverlay('blocked');
const showBackendDown = () => renderOverlay('backend-down');
const showNotConfigured = () => renderOverlay('not-configured');

/* ================= approval request + polling ================= */

async function onAskClicked() {
  const vid = currentVideoId;
  if (!vid) return;
  await renderOverlay('sending');
  try {
    const r = await bg({
      type: 'requestApproval',
      videoId: vid,
      title: getVideoTitle(),
      url: location.href,
      channelId: currentChannelId,
      channelTitle: currentChannelTitle
    });
    currentRequestId = r.id;
    await renderOverlay('waiting');
    startPolling();
  } catch (e) {
    // Request failed (server down, bad key, …) — stay blocked.
    if (getVideoId(location.href) === vid) await renderOverlay('backend-down');
  }
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const vid = currentVideoId;
    // Child navigated away while waiting — stop.
    if (!vid || getVideoId(location.href) !== vid || !currentRequestId) {
      stopPolling();
      return;
    }
    let r;
    try {
      r = await bg({ type: 'checkRequest', requestId: currentRequestId });
    } catch (e) {
      return; // transient failure: keep polling, video stays blocked
    }
    if (getVideoId(location.href) !== vid) { stopPolling(); return; }

    if (r.status === 'approved') {
      stopPolling();
      try { await bg({ type: 'markApproved', videoId: vid }); } catch (e) { /* non-fatal */ }
      mediaBlocked = false;
      removeOverlay();
      playMainVideo();
    } else if (r.status === 'denied') {
      stopPolling();
      await renderOverlay('denied');
    }
    // 'pending' -> keep waiting
  }, POLL_INTERVAL_MS);
}

/* ================= navigation handling ================= */

async function handleNavigation(force = false) {
  const url = location.href;
  lastUrl = url;
  stopPolling();

  const vid = getVideoId(url);
  if (vid === currentVideoId && !force) return;

  removeOverlay();
  currentVideoId = vid;
  currentRequestId = null;
  currentChannelId = '';
  currentChannelTitle = '';

  if (!vid) {
    mediaBlocked = false; // not a watch/shorts page (home, search, channel, …)
    return;
  }

  // This is a video page: block media immediately, allow only after a whitelist hit.
  mediaBlocked = true;
  pauseAllVideos();

  if (!settings.familyKey) {
    showNotConfigured();
    return;
  }

  let wl;
  try {
    wl = await bg({ type: 'getWhitelist' });
  } catch (e) {
    if (getVideoId(location.href) !== vid) return; // user already moved on
    showBackendDown();
    return;
  }
  if (getVideoId(location.href) !== vid) return; // navigated while we were waiting

  // Resolve the uploader's channel (waits briefly for YouTube's metadata).
  const ch = await getChannelInfo();
  if (getVideoId(location.href) !== vid) return;
  currentChannelId = ch.channelId;
  currentChannelTitle = ch.channelTitle;

  const allowed =
    wl.videoIds.includes(vid) ||
    (currentChannelId && (wl.channelIds || []).includes(currentChannelId)) ||
    (wl.approved || []).includes(vid);
  if (allowed) {
    mediaBlocked = false;
    removeOverlay();
    playMainVideo();
  } else {
    showBlocked(vid);
  }
}

/* ================= init (runs at document_start) ================= */

(async function init() {
  await loadSettings();

  // Pause any video element the moment it appears, and veto play attempts while blocked.
  const observer = new MutationObserver(() => { if (mediaBlocked) pauseAllVideos(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('play', (e) => {
    if (mediaBlocked && e.target instanceof HTMLVideoElement) {
      try { e.target.pause(); } catch (err) { /* ignore */ }
    }
  }, true);

  // YouTube SPA navigation events…
  document.addEventListener('yt-navigate-finish', () => handleNavigation());
  // …plus a fallback URL poll (covers back/forward and missed events).
  setInterval(() => { if (location.href !== lastUrl) handleNavigation(); }, NAV_CHECK_MS);

  handleNavigation();
})();
