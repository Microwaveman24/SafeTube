'use strict';
/* SafeTube parent dashboard — session-cookie auth (no family key in the browser). */

const REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);
const pendingEl = $('pending'), whitelistEl = $('whitelist'), historyEl = $('history');
const channelsEl = $('channels'), childrenEl = $('children'), devicesEl = $('devices');

function api(path, opts = {}) {
  return fetch(path, {
    credentials: 'same-origin',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(async (r) => {
    if (r.status === 401) {
      window.location.href = '/login.html';
      throw new Error('unauthorized');
    }
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.error || ('HTTP ' + r.status));
    }
    const text = await r.text();
    return text ? JSON.parse(text) : {};
  });
}

const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const channelUrl = (id) => `https://www.youtube.com/channel/${id}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };
const ago = (iso) => {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

/** Extract an 11-char YouTube video ID from a URL, embed/shorts link, or raw ID. */
function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
            s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
            s.match(/\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function parseChannelId(input) {
  const s = String(input || '').trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return s;
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

function deviceCard(d) {
  const div = document.createElement('div');
  div.className = 'card';
  const statusLabel = { online: 'Online', quiet: 'Quiet', 'never-seen': 'No signal yet' }[d.status] || d.status;
  div.innerHTML = `
    <div class="body">
      <div class="title">${esc(d.childName || 'Unnamed device')}</div>
      <div><span class="badge status-${d.status}">${esc(statusLabel)}</span>
        ${d.alerted ? '<span class="badge alerted">alert sent</span>' : ''}</div>
      <div class="meta">Last check-in: ${esc(ago(d.lastSeenAt))}</div>
      <div class="meta mono">ID: ${esc(d.deviceId)}</div>
      <div class="actions"><button class="btn remove">Forget device</button></div>
    </div>`;
  const btn = div.querySelector('button');
  btn.onclick = async () => {
    if (!confirm('Forget this device? It will re-register itself next time the extension checks in.')) return;
    btn.disabled = true;
    try {
      await api(`/api/devices/${encodeURIComponent(d.deviceId)}`, { method: 'DELETE' });
      await refresh();
    } catch (e) {
      btn.disabled = false;
      if (e.message !== 'unauthorized') alert('Remove failed: ' + e.message);
    }
  };
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
  try {
    const [pending, wl, channels, children, devices, history] = await Promise.all([
      api('/api/requests?status=pending'),
      api('/api/whitelist'),
      api('/api/channel-whitelist'),
      api('/api/children'),
      api('/api/devices'),
      api('/api/requests?status=all'),
    ]);
    $('pendingCount').textContent = pending.length;
    $('whitelistCount').textContent = wl.videoIds.length;
    $('channelCount').textContent = channels.channels.length;
    $('deviceCount').textContent = devices.devices.length;

    pendingEl.innerHTML = '';
    pendingEl.append(...(pending.length ? pending.map(requestCard) : [empty('No pending requests. 🎉')]));

    devicesEl.innerHTML = '';
    devicesEl.append(...(devices.devices.length ? devices.devices.map(deviceCard) : [empty('No devices yet — install the extension on the child\'s browser.')]));

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

async function loadMe() {
  try {
    const me = await api('/api/auth/me');
    $('parentEmail').textContent = me.email;
  } catch (e) { /* redirect handled by api() */ }
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
    alert('Could not find a channel ID. Paste a URL like https://www.youtube.com/channel/UC… or the raw channel ID.');
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

$('testEmailBtn').addEventListener('click', async (e) => {
  const btn = e.target;
  btn.disabled = true;
  try {
    const r = await api('/api/devices/test-email', { method: 'POST' });
    alert('Test email sent to ' + r.to);
  } catch (err) {
    if (err.message !== 'unauthorized') alert('Test email failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

$('accountBtn').addEventListener('click', async () => {
  const current = prompt('Enter your current password:');
  if (!current) return;
  const next1 = prompt('Enter a new password (min 8 characters):');
  if (!next1) return;
  const next2 = prompt('Confirm the new password:');
  if (next1 !== next2) { alert('Passwords do not match.'); return; }
  try {
    await api('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: current, newPassword: next1 }),
    });
    alert('Password changed.');
  } catch (err) {
    if (err.message !== 'unauthorized') alert('Password change failed: ' + err.message);
  }
});

$('logoutBtn').addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ }
  window.location.href = '/login.html';
});

loadMe();
refresh();
setInterval(refresh, REFRESH_MS);
