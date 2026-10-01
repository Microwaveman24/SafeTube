'use strict';
/**
 * Video-approval request routes.
 *
 * Extension-facing (X-Family-Key):
 * - POST /api/requests      → child submits a request
 * - GET  /api/requests/:id  → child polls for the decision
 *
 * Parent-facing (session):
 * - GET  /api/requests?status=… → list
 * - POST /api/requests/:id/decision → approve / deny
 */

const express = require('express');
const requests = require('../db/requests');
const { videos, channels } = require('../db/whitelists');
const { requireParent, requireFamilyKey } = require('../middleware/auth');
const { videoId, optString } = require('../middleware/validate');
const youtube = require('../services/youtube');

const router = express.Router();

router.post('/', requireFamilyKey, async (req, res, next) => {
  try {
    const vid = videoId(req.body && req.body.videoId);
    let title = optString(req.body && req.body.title);
    let channelId = optString(req.body && req.body.channelId, { max: 40 });
    let channelTitle = optString(req.body && req.body.channelTitle);

    if ((!title || !channelId)) {
      const meta = await youtube.enrich(vid);
      if (meta) {
        if (!title) title = meta.title;
        if (!channelId) channelId = meta.channelId;
        if (!channelTitle) channelTitle = meta.channelTitle;
      }
    }

    const created = requests.create({
      videoId: vid,
      title,
      url: optString(req.body && req.body.url, { max: 500 }),
      childName: optString(req.body && req.body.childName, { max: 100 }),
      channelId,
      channelTitle,
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireFamilyKey, (req, res, next) => {
  try {
    const row = requests.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'request not found' });
    res.json({ id: row.id, status: row.status });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireParent, (req, res, next) => {
  try {
    res.json(requests.list(req.query.status));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/decision', requireParent, (req, res, next) => {
  try {
    const decision = req.body && req.body.decision;
    if (decision !== 'approved' && decision !== 'denied') {
      return res.status(400).json({ error: 'decision must be "approved" or "denied"' });
    }
    const row = requests.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'request not found' });

    requests.setStatus(row.id, decision);
    let channelAllowed = false;
    if (decision === 'approved') {
      videos.add(row.videoId);
      if (req.body && req.body.alsoAllowChannel && row.channelId) {
        channels.add(row.channelId, row.channelTitle);
        channelAllowed = true;
      }
    }
    res.json({ id: row.id, status: decision, channelAllowed });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
