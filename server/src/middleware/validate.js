'use strict';
/**
 * Small input-validation helpers. Route handlers stay thin: validate at the
 * boundary, then work with clean values.
 */

function bad(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function reqString(value, name, { max = 500 } = {}) {
  if (typeof value !== 'string' || !value.trim()) throw bad(`${name} is required`);
  const v = value.trim();
  if (v.length > max) throw bad(`${name} is too long (max ${max} chars)`);
  return v;
}

function optString(value, { max = 500 } = {}) {
  if (value === undefined || value === null) return '';
  const v = String(value);
  if (v.length > max) throw bad(`field is too long (max ${max} chars)`);
  return v;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function videoId(value) {
  const v = reqString(value, 'videoId', { max: 32 });
  if (!VIDEO_ID_RE.test(v)) throw bad('videoId must be an 11-character YouTube video ID');
  return v;
}

function channelId(value) {
  const v = reqString(value, 'channelId', { max: 40 });
  if (!CHANNEL_ID_RE.test(v)) throw bad('channelId must be a YouTube channel ID (starts with UC)');
  return v;
}

function email(value) {
  const v = reqString(value, 'email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw bad('email is not valid');
  return v;
}

function password(value, name = 'password') {
  const v = reqString(value, name, { max: 128 });
  if (v.length < 8) throw bad(`${name} must be at least 8 characters`);
  return v;
}

module.exports = { bad, reqString, optString, videoId, channelId, email, password };
