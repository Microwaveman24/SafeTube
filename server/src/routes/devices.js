'use strict';
/**
 * Child device routes (extension-facing, X-Family-Key auth).
 *
 * - POST /api/devices/register   {deviceId, childName} → upsert device
 * - POST /api/devices/heartbeat  {deviceId}            → update last_seen_at
 *
 * Parent routes (session auth):
 * - GET    /api/devices          → all devices with live status
 * - DELETE /api/devices/:deviceId → forget a device
 * - POST   /api/devices/test-email → send a test alert email to the parent
 */

const express = require('express');
const devices = require('../db/devices');
const { requireParent, requireFamilyKey } = require('../middleware/auth');
const { reqString, optString } = require('../middleware/validate');
const monitor = require('../services/monitor');
const mailer = require('../services/mailer');
const parents = require('../db/parents');
const logger = require('../logger');
const { config } = require('../config');

const router = express.Router();

// --- extension-facing ---

router.post('/register', requireFamilyKey, (req, res, next) => {
  try {
    const deviceId = reqString(req.body && req.body.deviceId, 'deviceId', { max: 64 });
    const childName = optString(req.body && req.body.childName, { max: 100 });
    const device = devices.register(deviceId, childName);
    logger.debug(`[devices] registered heartbeat source: ${deviceId} (${childName})`);
    res.status(201).json({ ok: true, device: devices.toJson(device) });
  } catch (err) {
    next(err);
  }
});

router.post('/heartbeat', requireFamilyKey, async (req, res, next) => {
  try {
    const deviceId = reqString(req.body && req.body.deviceId, 'deviceId', { max: 64 });
    let device = devices.get(deviceId);
    if (!device) {
      // Auto-register unknown devices so a wiped extension storage self-heals.
      device = devices.register(deviceId, optString(req.body && req.body.childName, { max: 100 }));
    } else {
      const wasAlerted = device.alert_state === 1;
      devices.heartbeat(deviceId);
      if (wasAlerted) {
        const fresh = devices.get(deviceId);
        await monitor.handleDeviceBack(devices.toJson(fresh)).catch((e) => logger.error(e.message));
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- parent-facing ---

function withStatus(d) {
  const staleMs = config.tamperAlertAfterMinutes * 60 * 1000;
  const lastSeen = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : 0;
  const ageMs = Date.now() - lastSeen;
  const status = !d.lastSeenAt ? 'never-seen' : ageMs > staleMs ? 'quiet' : 'online';
  return { ...d, status, lastSeenMinutesAgo: d.lastSeenAt ? Math.round(ageMs / 60000) : null };
}

router.get('/', requireParent, (_req, res) => {
  res.json({ devices: devices.all().map(withStatus) });
});

router.delete('/:deviceId', requireParent, (req, res) => {
  devices.remove(req.params.deviceId);
  res.json({ ok: true });
});

router.post('/test-email', requireParent, async (req, res, next) => {
  try {
    const to = config.alertEmail || parents.allEmails()[0];
    if (!to) return res.status(400).json({ error: 'no parent email known' });
    if (!mailer.configured()) {
      return res.status(400).json({ error: 'SMTP is not configured on the server (see .env.example)' });
    }
    await mailer.sendMail({
      to,
      subject: 'SafeTube test email',
      text: 'This is a test email from your SafeTube server. Tamper alerts are working.',
    });
    res.json({ ok: true, to });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
