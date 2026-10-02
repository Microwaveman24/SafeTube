'use strict';
/**
 * Video-approval request routes.
 *
 * Extension-facing (X-Family-Key):
 * - POST /api/requests      → child submits a request
 * - GET  /api/requests/:id  → child polls for the decision
 *
 * Parent-facing (session):
 * - GET  /api/requests?status=…&childId=… → list (optional per-child filter)
 * - POST /api/requests/:id/decision → approve / deny (approvals land in that child's whitelists)
 */

const express = require('express');
const requests = require('../db/requests');
const children = require('../db/children');
const parents = require('../db/parents');
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

    const parentId = parents.firstId();
    if (!parentId) {
      return res.status(400).json({ error: 'parent setup required' });
    }
    const child = children.resolveOrCreate(
      parentId,
      optString(req.body && req.body.childName, { max: 100 })
    );

    const created = requests.create({
      videoId: vid,
      title,
      url: optString(req.body && req.body.url, { max: 500 }),
      childName: child.name,
      childId: child.id,
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
    let childId;
    const q = req.query.childId;
    if (q !== undefined && q !== null && q !== '') {
      const child = children.get(q);
      if (!child || child.parentId !== req.parent.id) {
        return res.status(404).json({ error: 'child not found' });
      }
      childId = child.id;
    }
    res.json(requests.list(req.query.status, childId));
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
      // Approvals land in the requesting child's whitelists — never a
      // global list. Legacy rows without a child fall back to name lookup.
      const childId = row.childId || children.resolveOrCreate(req.parent.id, row.childName || '').id;
      videos.add(childId, row.videoId);
      if (req.body && req.body.alsoAllowChannel && row.channelId) {
        channels.add(childId, row.channelId, row.channelTitle);
        channelAllowed = true;
      }
    }
    res.json({ id: row.id, status: decision, channelAllowed });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
