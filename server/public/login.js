'use strict';
/* SafeTube parent login. Redirects to one-time setup when no account exists. */

const form = document.getElementById('loginForm');
const errEl = document.getElementById('loginError');

async function checkStatus() {
  try {
    const r = await fetch('/api/auth/status');
    const s = await r.json();
    if (s.setupRequired) {
      window.location.href = '/setup.html';
    } else if (s.loggedIn) {
      window.location.href = '/';
    }
  } catch (e) {
    errEl.textContent = 'Could not reach the server.';
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = '';
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) {
      errEl.textContent = data.setupRequired
        ? 'No parent account yet — redirecting to setup…'
        : (data.error || 'Login failed.');
      if (data.setupRequired) setTimeout(() => (window.location.href = '/setup.html'), 1200);
      return;
    }
    window.location.href = '/';
  } catch (err) {
    errEl.textContent = 'Could not reach the server.';
  }
});

checkStatus();
