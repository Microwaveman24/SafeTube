'use strict';
/* SafeTube parent dashboard — vanilla JS. Family key stored in localStorage. */

const KEY_STORE = 'safetube.familyKey';
const REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);
const pendingEl = $('pending'), whitelistEl = $('whitelist'), historyEl = $('history');
const channelsEl = $('channels'), childrenEl = $('children');
const keyInput = $('familyKey');

function getKey() { return localStorage.getItem(KEY_STORE) || ''; }
function setKey(v) { localStorage.setItem(KEY_STORE, v); }

function api(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-Family-Key': getKey(), ...(opts.headers || {}) },
  }).then(async (r) => {
    if (r.status === 401) {
      pendingEl.innerHTML = '<div class="empty notice">Wrong or missing family key — enter it above and click Save.</div>';
      throw new Error('unauthorized');
    }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : {};
  });
}

const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const channelUrl = (id) => `https://www.youtube.com/channel/${id}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

/** Extract an 11-char YouTube video ID from a URL, embed/shorts link, or raw ID. */
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
            s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
            s.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Extract a channel ID from a channel URL (/channel/UC…), a watch URL is NOT
 * enough (needs the API), or a raw UC… ID. @handles can't be resolved without
 * a YouTube API key — the server will reject those with a hint.
 */
function parseChannelId(input) {
  const s = String(input || '').trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return s;
  // @handles can't be resolved to channel IDs without a YouTube API key —
  // those must be allowed from a video request card instead.
  const m = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  return m ? m[1] : null;
}

function requestCard(r) {
  const div = document.createElement('div');
  div.className = 'card';
  const channelLine = r.channelTitle || r.channelId
    ? `<div class="meta">Channel: <b>${esc(r.channelTitle || r.channelId)}</b></div>` : '';
  const allowChannelBtn = r.channelId
    ? `<button class="btn approve-channel">Approve + allow channel</button>` : '';
  div.innerHTML = `
    <img class="thumb" src="${thumb(r.videoId)}" alt="Video thumbnail" loading="lazy"
         onerror="this.style.display='none'">
    <div class="body">
      <div class="title"><a href="${watchUrl(r.videoId)}" target="_blank" rel="noopener">${esc(r.title || r.videoId)}</a></div>
      ${channelLine}
      <div class="meta">Requested by <b>${esc(r.childName || 'child')}</b> · ${esc(when(r.createdAt))}</div>
      <div class="actions">
        <button class="btn approve">Approve</button>
        <button class="btn deny">Decline</button>
      </div>
      ${allowChannelBtn ? `<div class="actions">${allowChannelBtn}</div>` : ''}
    </div>`;
  const [approveBtn, denyBtn] = div.querySelectorAll('.actions button.btn.approve, .actions button.btn.deny');
  const channelBtn = div.querySelector('button.approve-channel');
  const allBtns = [...div.querySelectorAll('button')];
  approveBtn.onclick = () => decide(r.id, 'approved', false, allBtns);
  denyBtn.onclick = () => decide(r.id, 'denied', false, allBtns);
  if (channelBtn) {
    channelBtn.onclick = () => {
      if (confirm(`Approve this video AND allow every video from "${r.channelTitle || r.channelId}"?`)) {
        decide(r.id, 'approved', true, allBtns);
      }
    };
  }
  return div;
}

async function decide(id, decision, alsoAllowChannel, btns) {
  btns.forEach((b) => (b.disabled = true));
  try {
    await api(`/api/requests/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, ...(alsoAllowChannel ? { alsoAllowChannel: true } : {}) }),
    });
    await refresh();
  } catch (e) {
    btns.forEach((b) => (b.disabled = false));
    if (e.message !== 'unauthorized') alert('Decision failed: ' + e.message);
  }
}

function whitelistCard(videoId) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <img class="thumb" src="${thumb(videoId)}" alt="Video thumbnail" loading="lazy"
         onerror="this.style.display='none'">
    <div class="body">
      <div class="title"><a href="${watchUrl(videoId)}" target="_blank" rel="noopener">${esc(videoId)}</a></div>
      <div class="actions"><button class="btn remove">Remove</button></div>
    </div>`;
  const btn = div.querySelector('button');
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      await api(`/api/whitelist/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      btn.disabled = false;
      if (e.message !== 'unauthorized') alert('Remove failed: ' + e.message);
    }
  };
  return div;
}

function channelCard(ch) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="body">
      <div class="title"><a href="${channelUrl(ch.channelId)}" target="_blank" rel="noopener">${esc(ch.title || ch.channelId)}</a></div>
      <div class="meta">ID: ${esc(ch.channelId)} · allowed ${esc(when(ch.addedAt))}</div>
      <div class="actions"><button class="btn remove">Remove</button></div>
    </div>`;
  const btn = div.querySelector('button');
  btn.onclick = async () => {
    if (!confirm('Stop allowing this entire channel? Its videos will need approval again.')) return;
    btn.disabled = true;
    try {
      await api(`/api/channel-whitelist/${encodeURIComponent(ch.channelId)}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      btn.disabled = false;
      if (e.message !== 'unauthorized') alert('Remove failed: ' + e.message);
    }
  };
  return div;
}

function childCard(c) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="body">
      <div class="title">${esc(c.name)}</div>
      <div class="meta">${c.requests} request(s) total · ${c.pending} pending</div>
    </div>`;
  return div;
}

function historyCard(r) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <img class="thumb" src="${thumb(r.videoId)}" alt="Video thumbnail" loading="lazy"
         onerror="this.style.display='none'">
    <div class="body">
      <div class="title"><a href="${watchUrl(r.videoId)}" target="_blank" rel="noopener">${esc(r.title || r.videoId)}</a></div>
      <div class="meta">${esc(r.childName || 'child')} · ${esc(when(r.createdAt))}</div>
      <div><span class="badge ${r.status}">${esc(r.status)}</span></div>
    </div>`;
  return div;
}

function empty(msg) {
  return Object.assign(document.createElement('div'), { className: 'empty', textContent: msg });
}

async function refresh() {
  if (!getKey()) return;
  try {
    const [pending, wl, channels, children, history] = await Promise.all([
      api('/api/requests?status=pending'),
      api('/api/whitelist'),
      api('/api/channel-whitelist'),
      api('/api/children'),
      api('/api/requests?status=all'),
    ]);
    $('pendingCount').textContent = pending.length;
    $('whitelistCount').textContent = wl.videoIds.length;
    $('channelCount').textContent = channels.channels.length;

    pendingEl.innerHTML = '';
    pendingEl.append(...(pending.length ? pending.map(requestCard) : [empty('No pending requests. 🎉')]));

    whitelistEl.innerHTML = '';
    whitelistEl.append(...(wl.videoIds.length ? wl.videoIds.map(whitelistCard) : [empty('Video whitelist is empty.')]));

    channelsEl.innerHTML = '';
    channelsEl.append(...(channels.channels.length ? channels.channels.map(channelCard) : [empty('No channels allowed yet.')]));

    childrenEl.innerHTML = '';
    childrenEl.append(...(children.children.length ? children.children.map(childCard) : [empty('No children have made requests yet.')]));

    const done = history.filter((r) => r.status !== 'pending');
    historyEl.innerHTML = '';
    historyEl.append(...(done.length ? done.map(historyCard) : [empty('No decisions yet.')]));
  } catch (e) {
    if (e.message !== 'unauthorized') console.error(e);
  }
}

// ---- wiring ----
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = parseVideoId($('addInput').value);
  if (!id) { alert('Could not find a video ID in that input.'); return; }
  try {
    await api('/api/whitelist', { method: 'POST', body: JSON.stringify({ videoId: id }) });
    $('addInput').value = '';
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthorized') alert('Add failed: ' + err.message);
  }
});

$('addChannelForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = parseChannelId($('addChannelInput').value);
  if (!id) {
    alert('Could not find a channel ID. Paste a URL like https://www.youtube.com/channel/UC… or the raw channel ID.\n(@handles need a YouTube API key on the server to resolve.)');
    return;
  }
  try {
    await api('/api/channel-whitelist', { method: 'POST', body: JSON.stringify({ channelId: id }) });
    $('addChannelInput').value = '';
    await refresh();
  } catch (err) {
    if (err.message !== 'unauthorized') alert('Add failed: ' + err.message);
  }
});

$('saveKey').addEventListener('click', () => {
  setKey(keyInput.value.trim());
  refresh();
});

$('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  window.location.href = '/login.html';
});

// Prompt for the family key on first load.
if (!getKey()) {
  const k = prompt('Enter your SafeTube family key (set FAMILY_KEY on the server):');
  if (k) { setKey(k.trim()); }
}
keyInput.value = getKey();

refresh();
setInterval(refresh, REFRESH_MS);
