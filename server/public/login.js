'use strict';
/* SafeTube parent dashboard login — posts to /api/auth/login (no family key needed). */

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('password').value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed (HTTP ' + res.status + ')');
    }
    window.location.href = '/';
  } catch (err) {
    errEl.textContent = err.message;
  }
});
