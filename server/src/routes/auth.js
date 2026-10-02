'use strict';
/**
 * Parent authentication routes.
 *
 * - GET  /api/auth/status          → { setupRequired, loggedIn, email? }
 * - POST /api/auth/setup           → one-time first-parent creation {email, password}
 * - POST /api/auth/login           → {email, password} → session cookie
 * - POST /api/auth/logout          → clears session
 * - GET  /api/auth/me              → current parent (requires login)
 * - POST /api/auth/change-password → {currentPassword, newPassword} (requires login)
 */

const express = require('express');
const parents = require('../db/parents');
const sessions = require('../db/sessions');
const { config } = require('../config');
const {
  requireParent,
  setSessionCookie,
  clearSessionCookie,
} = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { email, password } = require('../middleware/validate');
const logger = require('../logger');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    setupRequired: parents.setupRequired(),
    loggedIn: Boolean(req.parent),
    email: req.parent ? req.parent.email : null,
  });
});

function issueSession(res, parent) {
  const { token, expiresAt } = sessions.create(parent.id);
  setSessionCookie(res, token, expiresAt);
}

// One-time setup: only works when no parent account exists yet.
router.post('/setup', authLimiter, async (req, res, next) => {
  try {
    if (!parents.setupRequired()) {
      return res.status(400).json({ error: 'setup already completed' });
    }
    const em = email(req.body && req.body.email);
    const pw = password(req.body && req.body.password);
    const parent = await parents.createParent(em, pw);
    logger.info(`[auth] First parent account created: ${parent.email}`);
    issueSession(res, parent);
    res.status(201).json({ ok: true, email: parent.email });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'that email is already registered' });
    }
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    if (parents.setupRequired()) {
      return res.status(400).json({ error: 'setup required', setupRequired: true });
    }
    const em = email(req.body && req.body.email);
    const pw = req.body && req.body.password;
    if (!pw || typeof pw !== 'string') {
      return res.status(400).json({ error: 'password is required' });
    }
    // NOTE: password() enforces min length; for login we only require presence.
    const parent = await parents.verifyCredentials(em, pw);
    if (!parent) {
      return res.status(401).json({ error: 'invalid email or password' });
    }
    issueSession(res, parent);
    logger.info(`[auth] Parent logged in: ${parent.email}`);
    res.json({ ok: true, email: parent.email });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  const { parseCookies, SESSION_COOKIE } = require('../middleware/auth');
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  sessions.destroy(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireParent, (req, res) => {
  res.json({ id: req.parent.id, email: req.parent.email, createdAt: req.parent.createdAt });
});

/** Expose the family key to the logged-in parent (for pasting into the extension). */
router.get('/family-key', requireParent, (_req, res) => {
  res.json({ familyKey: config.familyKey });
});

router.post('/change-password', requireParent, authLimiter, async (req, res, next) => {
  try {
    const current = req.body && req.body.currentPassword;
    const nextPw = password(req.body && req.body.newPassword, 'newPassword');
    if (!current || typeof current !== 'string') {
      return res.status(400).json({ error: 'currentPassword is required' });
    }
    const ok = await parents.changePassword(req.parent.id, current, nextPw);
    if (!ok) return res.status(401).json({ error: 'current password is incorrect' });
    // Log out other sessions for safety, keep this one.
    const { parseCookies, SESSION_COOKIE } = require('../middleware/auth');
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    sessions.destroyAllForParent(req.parent.id);
    const { token: newToken, expiresAt } = sessions.create(req.parent.id);
    void token;
    setSessionCookie(res, newToken, expiresAt);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
