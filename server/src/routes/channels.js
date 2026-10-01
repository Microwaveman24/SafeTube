'use strict';
/**
 * Channel whitelist routes.
 * - GET  /api/channel-whitelist              (extension: family key)
 * - POST /api/channel-whitelist  {channelId, title?}  (parent: session)
 * - DELETE /api/channel-whitelist/:channelId          (parent: session)
 */

const express = require('express');
const { channels } = require('../db/whitelists');
const { requireParent, requireFamilyKey } = require('../middleware/auth');
const { channelId, optString } = require('../middleware/validate');

const router = express.Router();

router.get('/', requireFamilyKey, (_req, res) => {
  const all = channels.all();
  res.json({
    channels: all,
    channelIds: all.map((c) => c.channelId),
  });
});

router.post('/', requireParent, (req, res, next) => {
  try {
    channels.add(channelId(req.body && req.body.channelId), optString(req.body && req.body.title));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:channelId', requireParent, (req, res, next) => {
  try {
    channels.remove(channelId(req.params.channelId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
