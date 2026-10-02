'use strict';
/**
 * Per-child video whitelist routes.
 * - GET    /api/whitelist?childId=… | ?childName=… → { videoIds }   (parent session OR family key)
 * - POST   /api/whitelist  {videoId, childId}                      (parent: session)
 * - DELETE /api/whitelist/:videoId?childId=…                       (parent: session)
 *
 * The extension (X-Family-Key) passes ?childName= and gets that child's
 * list; the name is created on demand when unknown. The parent dashboard
 * (session) must pass ?childId= (GET/DELETE) or {childId} (POST).
 */

const express = require('express');
const { videos } = require('../db/whitelists');
const { requireParent, requireParentOrFamilyKey } = require('../middleware/auth');
const { videoId } = require('../middleware/validate');
const { resolveChild, ownChild } = require('./childScope');

const router = express.Router();

router.get('/', requireParentOrFamilyKey, (req, res, next) => {
  try {
    const child = resolveChild(req);
    res.json({ videoIds: videos.allIds(child.id) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireParent, (req, res, next) => {
  try {
    const child = ownChild(req, req.body && req.body.childId);
    videos.add(child.id, videoId(req.body && req.body.videoId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:videoId', requireParent, (req, res, next) => {
  try {
    const child = ownChild(req, req.query.childId);
    videos.remove(child.id, videoId(req.params.videoId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
