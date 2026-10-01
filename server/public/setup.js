'use strict';
/* SafeTube one-time parent account setup. */

const form = document.getElementById('setupForm');
const errEl = document.getElementById('setupError');

async function checkStatus() {
  try {
    const r = await fetch('/api/auth/status');
    const s = await r.json();
    if (!s.setupRequired) {
      window.location.href = s.loggedIn ? '/' : '/login.html';
    }
  } catch (e) {
    errEl.textContent = 'Could not reach the server.';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const email = document.getElementById('email').value.trim();
  const pw = document.getElementById('password').value;
  const pw2 = document.getElementById('password2').value;
  if (pw !== pw2) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }
  try {
    const r = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw }),
    });
    const data = await r.json();
    if (!r.ok) {
      errEl.textContent = data.error || 'Setup failed.';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errEl.textContent = 'Could not reach the server.';
  }
});

checkStatus();
