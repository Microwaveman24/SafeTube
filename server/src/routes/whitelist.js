'use strict';
/**
 * Video whitelist routes.
 * - GET  /api/whitelist            → { videoIds }              (extension: family key)
 * - POST /api/whitelist            → { videoId }               (parent: session)
 * - DELETE /api/whitelist/:videoId                            (parent: session)
 */

const express = require('express');
const { videos } = require('../db/whitelists');
const { requireParent, requireFamilyKey } = require('../middleware/auth');
const { videoId } = require('../middleware/validate');

const router = express.Router();

router.get('/', requireFamilyKey, (_req, res) => {
  res.json({ videoIds: videos.allIds() });
});

router.post('/', requireParent, (req, res, next) => {
  try {
    videos.add(videoId(req.body && req.body.videoId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:videoId', requireParent, (req, res, next) => {
  try {
    videos.remove(videoId(req.params.videoId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
