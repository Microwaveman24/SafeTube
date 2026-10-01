'use strict';
/**
 * Authentication middleware. Two separate credentials for two audiences:
 *
 * - The parent dashboard uses a session cookie (set at /api/auth/login).
 *   Management routes require it via requireParent.
 * - The child's extension uses X-Family-Key (a shared secret configured in
 *   the extension's options page). Device/child-facing routes require it
 *   via requireFamilyKey.
 *
 * Keeping these separate means a leaked family key can't manage the
 * dashboard, and dashboard sessions can't be minted by the extension.
 */

const sessions = require('../db/sessions');
const parents = require('../db/parents');
const { config } = require('../config');

const SESSION_COOKIE = 'st_session';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, expiresAt) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
}

/** Attach req.parent when a valid session cookie is present (null otherwise). */
function attachParent(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  const sess = sessions.get(token);
  req.parent = sess ? parents.byId(sess.parent_id) : null;
  next();
}

/** Require a logged-in parent. Use on dashboard management routes. */
function requireParent(req, res, next) {
  if (!req.parent) {
    return res.status(401).json({ error: 'parent login required' });
  }
  next();
}

/** Require the X-Family-Key shared secret. Use on extension/device routes. */
function requireFamilyKey(req, res, next) {
  const key = req.get('X-Family-Key');
  if (!key || key !== config.familyKey) {
    return res.status(401).json({ error: 'unauthorized: invalid or missing X-Family-Key' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  attachParent,
  requireParent,
  requireFamilyKey,
};
