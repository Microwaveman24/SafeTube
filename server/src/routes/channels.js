'use strict';
/**
 * Per-child channel whitelist routes.
 * - GET    /api/channel-whitelist?childId=… | ?childName=… → { channelIds } (family key) | { channels } (parent session)
 * - POST   /api/channel-whitelist  {channelId, title?, childId}            (parent: session)
 * - DELETE /api/channel-whitelist/:channelId?childId=…                     (parent: session)
 */

const express = require('express');
const { channels } = require('../db/whitelists');
const { requireParent, requireParentOrFamilyKey } = require('../middleware/auth');
const { channelId, optString } = require('../middleware/validate');
const { resolveChild, ownChild } = require('./childScope');

const router = express.Router();

router.get('/', requireParentOrFamilyKey, (req, res, next) => {
  try {
    const child = resolveChild(req);
    const all = channels.all(child.id);
    if (req.parent) {
      res.json({ channels: all });
    } else {
      res.json({ channelIds: all.map((c) => c.channelId) });
    }
  } catch (err) {
    next(err);
  }
});

router.post('/', requireParent, (req, res, next) => {
  try {
    const child = ownChild(req, req.body && req.body.childId);
    channels.add(
      child.id,
      channelId(req.body && req.body.channelId),
      optString(req.body && req.body.title)
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:channelId', requireParent, (req, res, next) => {
  try {
    const child = ownChild(req, req.query.childId);
    channels.remove(child.id, channelId(req.params.channelId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
