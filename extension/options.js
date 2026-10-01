/**
 * SafeTube — options page logic.
 * Stores settings in chrome.storage.local and can test the backend connection.
 */
'use strict';

function $(id) { return document.getElementById(id); }

function showStatus(text, cls) {
  const el = $('status');
  el.textContent = text;
  el.className = cls || '';
}

function readForm() {
  return {
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, '') || 'http://localhost:3000',
    familyKey: $('familyKey').value.trim(),
    childName: $('childName').value.trim()
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  // Pre-fill from storage.
  const cur = await chrome.storage.local.get(['tg_baseUrl', 'tg_familyKey', 'tg_childName']);
  $('baseUrl').value = cur.tg_baseUrl || 'http://localhost:3000';
  $('familyKey').value = cur.tg_familyKey || '';
  $('childName').value = cur.tg_childName || '';

  // Show this browser's device ID (used for tamper detection).
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'getDeviceId' });
    if (resp && resp.ok) $('deviceId').textContent = 'Device ID: ' + resp.deviceId;
  } catch (e) {
    $('deviceId').textContent = 'Device ID unavailable — the background worker may still be starting.';
  }

  $('saveBtn').addEventListener('click', async () => {
    const { baseUrl, familyKey, childName } = readForm();
    await chrome.storage.local.set({
      tg_baseUrl: baseUrl,
      tg_familyKey: familyKey,
      tg_childName: childName
    });
    // Nudge the background worker to refresh the whitelist with the new settings.
    try { chrome.runtime.sendMessage({ type: 'refreshWhitelist' }); } catch (e) { /* worker may be busy */ }
    showStatus('Settings saved.', 'ok');
  });

  $('testBtn').addEventListener('click', async () => {
    const { baseUrl, familyKey } = readForm();
    showStatus('Testing connection…');
    try {
      const res = await fetch(baseUrl + '/api/whitelist', {
        headers: { 'X-Family-Key': familyKey }
      });
      if (!res.ok) throw new Error('server replied HTTP ' + res.status);
      const data = await res.json();
      const n = Array.isArray(data.videoIds) ? data.videoIds.length : 0;
      showStatus('Connected! The whitelist currently has ' + n + ' video(s).', 'ok');
    } catch (e) {
      showStatus('Connection failed: ' + (e.message || e) +
        ' — is the parent server running and is the family key correct?', 'err');
    }
  });
});
